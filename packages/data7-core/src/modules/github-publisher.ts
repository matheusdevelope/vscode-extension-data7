import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as https from "https";
import { execSync } from "child_process";
import { logger } from "../infra/logger";
import { GitHubAuth } from "./github-auth";
import { ManifestRegistry } from "./manifest-registry";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { parseBasic } from "../project/parser";

export class GitHubPublisher {
  private static get UPSTREAM_REPO(): string {
    return process.env.DATA7_GITHUB_REPO || "matheusdevelope/data7-modules";
  }

  /**
   * Validates and publishes the module to the online registry by creating a Fork,
   * pushing code using Git, and opening a Pull Request.
   */
  public static async publish(
    workspaceDir: string,
    onAuthPrompt: (userCode: string, verificationUri: string) => void
  ): Promise<string> {
    // 1. Validate module first
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      throw new Error(`Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace: ${workspaceDir}`);
    }

    if (!manifest.nome || typeof manifest.nome !== "string" || manifest.nome.trim() === "") {
      throw new Error("O campo 'nome' no arquivo 'data7.json' é obrigatório e deve ser uma string não vazia.");
    }

    const moduleName = manifest.nome.trim();

    const srcDir = path.join(workspaceDir, "src");
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      throw new Error("A pasta 'src' é obrigatória na raiz do módulo.");
    }

    const srcFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas", ".d7form"]);
    if (srcFiles.length === 0) {
      throw new Error("A pasta 'src' deve conter pelo menos um arquivo de código.");
    }

    // Check syntax for all .bas files before publishing
    for (const filePath of srcFiles) {
      if (filePath.toLowerCase().endsWith(".bas")) {
        const code = fs.readFileSync(filePath, "utf-8");
        const result = parseBasic(code);
        if (result.errors && result.errors.length > 0) {
          const errMsgs = result.errors.map((e: any) => `linha ${e.loc?.startLine ?? "?"}: ${e.message}`).join("; ");
          throw new Error(`Erro de compilação/sintaxe em '${path.basename(filePath)}': ${errMsgs}`);
        }
      }
    }

    // 2. Ensure GitHub Authenticated
    let token = GitHubAuth.getStoredToken();
    if (!token) {
      logger.info("Token não encontrado. Iniciando Device Flow...");
      const deviceCode = await GitHubAuth.requestDeviceCode();
      onAuthPrompt(deviceCode.user_code, deviceCode.verification_uri);
      
      token = await GitHubAuth.pollForToken(deviceCode.device_code, deviceCode.interval);
      GitHubAuth.storeToken(token);
    }

    // 3. Get Authenticated User Info
    const userRes = await this.githubApiRequest("GET", "/user", token);
    const userInfo = JSON.parse(userRes) as { login: string };
    const username = userInfo.login;
    logger.info(`Autenticado no GitHub como: ${username}`);

    // 4. Create Repository Fork
    logger.info(`Criando fork do repositório ${this.UPSTREAM_REPO} para a conta do usuário...`);
    await this.githubApiRequest("POST", `/repos/${this.UPSTREAM_REPO}/forks`, token);

    // 5. Poll GitHub to verify the fork exists and is ready
    let forkReady = false;
    let forkInfo: any = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const forkRes = await this.githubApiRequest("GET", `/repos/${username}/${path.basename(this.UPSTREAM_REPO)}`, token);
        forkInfo = JSON.parse(forkRes);
        if (forkInfo && forkInfo.name) {
          forkReady = true;
          break;
        }
      } catch {
        // Wait and retry
      }
      logger.info(`Aguardando criação do fork (tentativa ${attempt}/10)...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!forkReady || !forkInfo) {
      throw new Error(`O fork em github.com/${username}/${path.basename(this.UPSTREAM_REPO)} não ficou pronto a tempo.`);
    }

    const defaultBranch = forkInfo.default_branch || "main";

    // 6. Shallow Clone the Fork to a local temporary directory
    const tempDir = path.join(os.homedir(), ".data7", "temp_clone");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const authenticatedCloneUrl = `https://x-access-token:${token}@github.com/${username}/${path.basename(this.UPSTREAM_REPO)}.git`;
    logger.info("Realizando clone raso do Fork do usuário...");
    try {
      execSync(`git clone --depth 1 --branch ${defaultBranch} "${authenticatedCloneUrl}" "${tempDir}"`, { stdio: "pipe" });
    } catch (err: any) {
      throw new Error(`Falha ao clonar o fork: ${err.stderr?.toString() || err.message}`);
    }

    // 7. Copy module files into the clone's modules directory
    const targetModuleDir = path.join(tempDir, "modules", moduleName.toLowerCase());
    if (fs.existsSync(targetModuleDir)) {
      fs.rmSync(targetModuleDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetModuleDir, { recursive: true });

    // Copy manifest
    fs.copyFileSync(manifestPath, path.join(targetModuleDir, ManifestRegistry.FILENAME));

    // Copy src directory files
    const targetSrcDir = path.join(targetModuleDir, "src");
    fs.mkdirSync(targetSrcDir, { recursive: true });

    for (const srcFilePath of srcFiles) {
      const relPath = path.relative(srcDir, srcFilePath);
      const destPath = path.join(targetSrcDir, relPath);
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(srcFilePath, destPath);
    }

    // 8. Commit and Push to the fork
    logger.info("Executando Git Commit e Git Push no Fork do desenvolvedor...");
    try {
      // Configure local git name/email to avoid failures if not set globally
      execSync(`git config user.name "Data7 Developer"`, { cwd: tempDir });
      execSync(`git config user.email "developer@data7.io"`, { cwd: tempDir });

      execSync(`git add modules/${moduleName.toLowerCase()}`, { cwd: tempDir, stdio: "pipe" });
      
      const status = execSync("git status --porcelain", { cwd: tempDir }).toString().trim();
      if (!status) {
        logger.info("Nenhuma alteração detectada para publicar.");
      } else {
        const moduleVersion = (manifest.raw.version as string) ?? manifest.opcoes.versao ?? "1.0.0.0";
        execSync(`git commit -m "Publish module ${moduleName} v${moduleVersion}"`, { cwd: tempDir, stdio: "pipe" });
        execSync(`git push origin ${defaultBranch}`, { cwd: tempDir, stdio: "pipe" });
      }
    } catch (err: any) {
      throw new Error(`Falha ao empurrar alterações de Git: ${err.stderr?.toString() || err.message}`);
    } finally {
      // Clean up temporary clone folder
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    
    // 9. Open Pull Request on the upstream repository
    const [owner] = this.UPSTREAM_REPO.split("/");
    if (owner && username.toLowerCase() === owner.toLowerCase()) {
      logger.info("Publicação concluída diretamente no repositório principal (usuário é o proprietário).");
      return `https://github.com/${this.UPSTREAM_REPO}`;
    }

    logger.info("Abrindo Pull Request no repositório oficial da extensão...");
    const prBody = JSON.stringify({
      title: `Publish module ${moduleName} v${(manifest.raw.version as string) ?? manifest.opcoes.versao ?? "1.0.0.0"}`,
      head: `${username}:${defaultBranch}`,
      base: defaultBranch,
      body: `Publicação automática do módulo \`${moduleName}\` criado via ferramentas de desenvolvedor do ecossistema Data7.`
    });

    try {
      const prRes = await this.githubApiRequest("POST", `/repos/${this.UPSTREAM_REPO}/pulls`, token, prBody);
      const prInfo = JSON.parse(prRes) as { html_url: string };
      logger.info(`Pull Request criado com sucesso: ${prInfo.html_url}`);
      return prInfo.html_url;
    } catch (err: any) {
      throw new Error(`Módulo enviado ao Fork, mas erro ao criar Pull Request: ${err.message}`);
    }
  }

  private static githubApiRequest(
    method: "GET" | "POST",
    apiPath: string,
    token: string,
    body?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "data7-publisher",
          ...(body ? {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          } : {})
        }
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`GitHub API retornou status ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}
