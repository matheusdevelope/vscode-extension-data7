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
import { isRecord } from "../project/project-config";
import { RepositoryQueryService, type ModuleManifest } from "./repository-query-service";

interface PreparedModuleForPublish {
  readonly moduleName: string;
  readonly moduleVersion: string;
  readonly manifestPath: string;
  readonly srcDir: string;
  readonly srcFiles: readonly string[];
  readonly localFiles: ReadonlyMap<string, string>;
}

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
    onAuthPrompt: (userCode: string, verificationUri: string) => void,
  ): Promise<string> {
    const prepared = await this.prepareModuleForPublish(workspaceDir);

    // 2. Ensure GitHub Authenticated. All public duplicate/release checks already ran above.
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
        const forkRes = await this.githubApiRequest(
          "GET",
          `/repos/${username}/${path.basename(this.UPSTREAM_REPO)}`,
          token,
        );
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
      throw new Error(
        `O fork em github.com/${username}/${path.basename(this.UPSTREAM_REPO)} não ficou pronto a tempo.`,
      );
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
      execSync(
        `git clone --depth 1 --branch ${defaultBranch} "${authenticatedCloneUrl}" "${tempDir}"`,
        { stdio: "pipe" },
      );
    } catch (err: any) {
      throw new Error(`Falha ao clonar o fork: ${err.stderr?.toString() || err.message}`);
    }

    // 7. Copy module files into the clone's modules directory
    const targetModuleDir = path.join(tempDir, "modules", prepared.moduleName.toLowerCase());
    if (fs.existsSync(targetModuleDir)) {
      fs.rmSync(targetModuleDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetModuleDir, { recursive: true });

    // Copy manifest
    this.writePublishedManifest(
      prepared.manifestPath,
      path.join(targetModuleDir, ManifestRegistry.FILENAME),
      username,
    );

    // Copy src directory files
    const targetSrcDir = path.join(targetModuleDir, "src");
    fs.mkdirSync(targetSrcDir, { recursive: true });

    for (const srcFilePath of prepared.srcFiles) {
      const relPath = path.relative(prepared.srcDir, srcFilePath);
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

      execSync(`git add modules/${prepared.moduleName.toLowerCase()}`, {
        cwd: tempDir,
        stdio: "pipe",
      });

      const status = execSync("git status --porcelain", { cwd: tempDir }).toString().trim();
      if (!status) {
        logger.info("Nenhuma alteração detectada para publicar.");
      } else {
        execSync(
          `git commit -m "Publish module ${prepared.moduleName} v${prepared.moduleVersion}"`,
          {
            cwd: tempDir,
            stdio: "pipe",
          },
        );
        execSync(`git push origin ${defaultBranch}`, { cwd: tempDir, stdio: "pipe" });
      }
    } catch (err: any) {
      throw new Error(
        `Falha ao empurrar alterações de Git: ${err.stderr?.toString() || err.message}`,
      );
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
      logger.info(
        "Publicação concluída diretamente no repositório principal (usuário é o proprietário).",
      );
      return `https://github.com/${this.UPSTREAM_REPO}`;
    }

    logger.info("Abrindo Pull Request no repositório oficial da extensão...");
    const prBody = JSON.stringify({
      title: `Publish module ${prepared.moduleName} v${prepared.moduleVersion}`,
      head: `${username}:${defaultBranch}`,
      base: defaultBranch,
      body: `Publicação automática do módulo \`${prepared.moduleName}\` criado via ferramentas de desenvolvedor do ecossistema Data7.`,
    });

    try {
      const prRes = await this.githubApiRequest(
        "POST",
        `/repos/${this.UPSTREAM_REPO}/pulls`,
        token,
        prBody,
      );
      const prInfo = JSON.parse(prRes) as { html_url: string };
      logger.info(`Pull Request criado com sucesso: ${prInfo.html_url}`);
      return prInfo.html_url;
    } catch (err: any) {
      throw new Error(`Módulo enviado ao Fork, mas erro ao criar Pull Request: ${err.message}`);
    }
  }

  public static async unpublish(
    moduleName: string,
    onAuthPrompt: (userCode: string, verificationUri: string) => void,
  ): Promise<string> {
    const normalizedModuleName = moduleName.trim();
    if (!normalizedModuleName) {
      throw new Error("Informe o nome do módulo a remover do repositório online.");
    }

    const onlineManifest =
      await RepositoryQueryService.fetchOnlineModuleManifest(normalizedModuleName);
    if (!onlineManifest) {
      throw new Error(
        `O módulo "${normalizedModuleName}" não possui release válida no repositório online.`,
      );
    }

    const token = await this.ensureToken(onAuthPrompt);
    const username = await this.getAuthenticatedUsername(token);
    const [owner] = this.UPSTREAM_REPO.split("/");
    const isOwner = owner !== undefined && username.toLowerCase() === owner.toLowerCase();
    const publisher = this.getManifestPublisher(onlineManifest);
    if (!isOwner && (!publisher || publisher.toLowerCase() !== username.toLowerCase())) {
      throw new Error(
        publisher
          ? `Somente o publisher "${publisher}" ou o dono do repositório pode remover o módulo "${normalizedModuleName}".`
          : `O módulo "${normalizedModuleName}" não declara module.publisher; somente o dono do repositório pode removê-lo.`,
      );
    }

    const { tempDir, defaultBranch } = await this.cloneUserFork(username, token);
    try {
      const targetModuleDir = path.join(tempDir, "modules", normalizedModuleName.toLowerCase());
      if (!fs.existsSync(targetModuleDir)) {
        throw new Error(`O módulo "${normalizedModuleName}" não existe no clone do repositório.`);
      }
      fs.rmSync(targetModuleDir, { recursive: true, force: true });

      execSync(`git config user.name "Data7 Developer"`, { cwd: tempDir });
      execSync(`git config user.email "developer@data7.io"`, { cwd: tempDir });
      execSync(`git add -A modules/${normalizedModuleName.toLowerCase()}`, {
        cwd: tempDir,
        stdio: "pipe",
      });
      const status = execSync("git status --porcelain", { cwd: tempDir }).toString().trim();
      if (!status) {
        throw new Error(
          `Nenhuma alteração detectada para remover o módulo "${normalizedModuleName}".`,
        );
      }
      execSync(`git commit -m "Unpublish module ${normalizedModuleName}"`, {
        cwd: tempDir,
        stdio: "pipe",
      });
      execSync(`git push origin ${defaultBranch}`, { cwd: tempDir, stdio: "pipe" });
    } catch (err: any) {
      throw new Error(`Falha ao preparar unpublish: ${err.stderr?.toString() || err.message}`);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }

    if (isOwner) {
      logger.info("Unpublish enviado diretamente ao repositório principal.");
      return `https://github.com/${this.UPSTREAM_REPO}`;
    }

    const prBody = JSON.stringify({
      title: `Unpublish module ${normalizedModuleName}`,
      head: `${username}:${defaultBranch}`,
      base: defaultBranch,
      body: `Remoção solicitada do módulo \`${normalizedModuleName}\` do catálogo público Data7.`,
    });

    try {
      const prRes = await this.githubApiRequest(
        "POST",
        `/repos/${this.UPSTREAM_REPO}/pulls`,
        token,
        prBody,
      );
      const prInfo = JSON.parse(prRes) as { html_url: string };
      logger.info(`Pull Request de unpublish criado com sucesso: ${prInfo.html_url}`);
      return prInfo.html_url;
    } catch (err: any) {
      throw new Error(`Módulo removido no Fork, mas erro ao criar Pull Request: ${err.message}`);
    }
  }

  private static async prepareModuleForPublish(
    workspaceDir: string,
  ): Promise<PreparedModuleForPublish> {
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      throw new Error(
        `Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace: ${workspaceDir}`,
      );
    }

    const moduleName = this.getPublishModuleName(manifest.raw, manifest.nome);
    if (!moduleName) {
      throw new Error(
        "O campo 'nome' ou 'module.name' no arquivo 'data7.json' é obrigatório para publicar um módulo.",
      );
    }

    const srcDir = path.join(workspaceDir, "src");
    if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
      throw new Error("A pasta 'src' é obrigatória na raiz do módulo.");
    }

    const srcFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas", ".d7form"]);
    if (srcFiles.length === 0) {
      throw new Error("A pasta 'src' deve conter pelo menos um arquivo de código.");
    }

    for (const filePath of srcFiles) {
      if (!filePath.toLowerCase().endsWith(".bas")) continue;
      const code = fs.readFileSync(filePath, "utf-8");
      const result = parseBasic(code);
      if (result.errors && result.errors.length > 0) {
        const errMsgs = result.errors
          .map((e: any) => `linha ${e.loc?.startLine ?? "?"}: ${e.message}`)
          .join("; ");
        throw new Error(`Erro de compilação/sintaxe em '${path.basename(filePath)}': ${errMsgs}`);
      }
    }

    const moduleVersion = this.getManifestVersion(manifest.raw, manifest.opcoes.versao);
    const localFiles = this.buildLocalFileMap(manifestPath, srcDir, srcFiles);
    await this.assertReleaseIsPublishable(moduleName, moduleVersion, localFiles);
    return { moduleName, moduleVersion, manifestPath, srcDir, srcFiles, localFiles };
  }

  private static async ensureToken(
    onAuthPrompt: (userCode: string, verificationUri: string) => void,
  ): Promise<string> {
    let token = GitHubAuth.getStoredToken();
    if (!token) {
      logger.info("Token não encontrado. Iniciando Device Flow...");
      const deviceCode = await GitHubAuth.requestDeviceCode();
      onAuthPrompt(deviceCode.user_code, deviceCode.verification_uri);
      token = await GitHubAuth.pollForToken(deviceCode.device_code, deviceCode.interval);
      GitHubAuth.storeToken(token);
    }
    return token;
  }

  private static async getAuthenticatedUsername(token: string): Promise<string> {
    const userRes = await this.githubApiRequest("GET", "/user", token);
    const userInfo = JSON.parse(userRes) as { login: string };
    logger.info(`Autenticado no GitHub como: ${userInfo.login}`);
    return userInfo.login;
  }

  private static async cloneUserFork(
    username: string,
    token: string,
  ): Promise<{ tempDir: string; defaultBranch: string }> {
    logger.info(`Criando fork do repositório ${this.UPSTREAM_REPO} para a conta do usuário...`);
    await this.githubApiRequest("POST", `/repos/${this.UPSTREAM_REPO}/forks`, token);

    const repoName = path.basename(this.UPSTREAM_REPO);
    let forkReady = false;
    let forkInfo: any = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        const forkRes = await this.githubApiRequest("GET", `/repos/${username}/${repoName}`, token);
        forkInfo = JSON.parse(forkRes);
        if (forkInfo?.name) {
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
      throw new Error(`O fork em github.com/${username}/${repoName} não ficou pronto a tempo.`);
    }

    const defaultBranch = forkInfo.default_branch || "main";
    const tempDir = path.join(os.homedir(), ".data7", "temp_clone");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const authenticatedCloneUrl = `https://x-access-token:${token}@github.com/${username}/${repoName}.git`;
    logger.info("Realizando clone raso do Fork do usuário...");
    try {
      execSync(
        `git clone --depth 1 --branch ${defaultBranch} "${authenticatedCloneUrl}" "${tempDir}"`,
        { stdio: "pipe" },
      );
    } catch (err: any) {
      throw new Error(`Falha ao clonar o fork: ${err.stderr?.toString() || err.message}`);
    }
    return { tempDir, defaultBranch };
  }

  private static async assertReleaseIsPublishable(
    moduleName: string,
    moduleVersion: string,
    localFiles: ReadonlyMap<string, string>,
  ): Promise<void> {
    const onlineManifest = await RepositoryQueryService.fetchOnlineModuleManifest(moduleName);
    if (!onlineManifest) return;

    const onlineVersion = this.getOnlineManifestVersion(onlineManifest);
    const onlineFiles = await RepositoryQueryService.fetchOnlineModuleFiles(moduleName);
    const remoteFiles = new Map(
      (onlineFiles ?? []).map((file) => [this.normalizePublishPath(file.path), file.content]),
    );

    if (this.areFileMapsEqual(localFiles, remoteFiles)) {
      throw new Error(
        `O módulo "${moduleName}" já está publicado na versão ${onlineVersion} e o projeto local não tem alterações para publicar.`,
      );
    }

    if (!this.isNewerVersion(moduleVersion, onlineVersion)) {
      throw new Error(
        `O módulo "${moduleName}" já existe online na versão ${onlineVersion}. Para publicar alterações, atualize a versão local para uma versão maior que ${onlineVersion}.`,
      );
    }
  }

  private static buildLocalFileMap(
    manifestPath: string,
    srcDir: string,
    srcFiles: readonly string[],
  ): ReadonlyMap<string, string> {
    const files = new Map<string, string>();
    files.set(ManifestRegistry.FILENAME, this.normalizeManifestContent(manifestPath));
    for (const srcFile of srcFiles) {
      const relPath = this.normalizePublishPath(path.join("src", path.relative(srcDir, srcFile)));
      files.set(relPath, fs.readFileSync(srcFile, "utf-8"));
    }
    return files;
  }

  private static normalizeManifestContent(manifestPath: string): string {
    const content = fs.readFileSync(manifestPath, "utf-8");
    try {
      return this.normalizeManifestJsonForComparison(JSON.parse(content));
    } catch {
      return content;
    }
  }

  private static sortJsonKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortJsonKeys(item));
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, this.sortJsonKeys(value[key])]),
    );
  }

  private static areFileMapsEqual(
    localFiles: ReadonlyMap<string, string>,
    remoteFiles: ReadonlyMap<string, string>,
  ): boolean {
    if (localFiles.size !== remoteFiles.size) return false;
    for (const [filePath, localContent] of localFiles) {
      const remoteContent = remoteFiles.get(filePath);
      if (remoteContent === undefined) return false;
      const normalizedLocal =
        filePath === ManifestRegistry.FILENAME ? localContent : this.normalizeText(localContent);
      const normalizedRemote =
        filePath === ManifestRegistry.FILENAME
          ? this.normalizeRemoteManifestContent(remoteContent)
          : this.normalizeText(remoteContent);
      if (normalizedLocal !== normalizedRemote) return false;
    }
    return true;
  }

  private static normalizeRemoteManifestContent(content: string): string {
    try {
      return this.normalizeManifestJsonForComparison(JSON.parse(content));
    } catch {
      return content;
    }
  }

  private static normalizeManifestJsonForComparison(value: unknown): string {
    if (isRecord(value) && isRecord(value.module)) {
      const moduleConfig = { ...value.module };
      delete moduleConfig.publisher;
      value = { ...value, module: moduleConfig };
    }
    return JSON.stringify(this.sortJsonKeys(value), null, 2);
  }

  private static writePublishedManifest(
    srcPath: string,
    destPath: string,
    publisher: string,
  ): void {
    const raw = fs.readFileSync(srcPath, "utf-8");
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const moduleConfig = isRecord(parsed.module) ? { ...parsed.module } : {};
      moduleConfig.enabled = moduleConfig.enabled ?? true;
      moduleConfig.name =
        typeof moduleConfig.name === "string" && moduleConfig.name.trim()
          ? moduleConfig.name
          : parsed.nome;
      moduleConfig.publisher = publisher;
      parsed.module = moduleConfig;
      fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2), "utf-8");
    } catch {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  private static normalizeText(content: string): string {
    return content.replace(/\r\n/g, "\n").trimEnd();
  }

  private static normalizePublishPath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
  }

  private static getPublishModuleName(raw: Record<string, unknown>, fallbackName: string): string {
    const moduleConfig = raw.module;
    if (isRecord(moduleConfig) && typeof moduleConfig.name === "string") {
      const moduleName = moduleConfig.name.trim();
      if (moduleName) return moduleName;
    }
    return fallbackName.trim();
  }

  private static getManifestVersion(raw: Record<string, unknown>, fallbackVersion: string): string {
    if (typeof raw.version === "string" && raw.version.trim()) return raw.version.trim();
    return fallbackVersion || "1.0.0.0";
  }

  private static getOnlineManifestVersion(manifest: ModuleManifest): string {
    if (typeof manifest.version === "string" && manifest.version.trim()) {
      return manifest.version.trim();
    }
    const opcoes = manifest.opcoes;
    if (isRecord(opcoes) && typeof opcoes.versao === "string" && opcoes.versao.trim()) {
      return opcoes.versao.trim();
    }
    return "0.0.0.0";
  }

  private static getManifestPublisher(manifest: ModuleManifest): string | undefined {
    const moduleConfig = manifest.module;
    if (isRecord(moduleConfig) && typeof moduleConfig.publisher === "string") {
      const publisher = moduleConfig.publisher.trim();
      if (publisher) return publisher;
    }
    return undefined;
  }

  private static isNewerVersion(candidate: string, current: string): boolean {
    const p1 = candidate.split(".").map((part) => Number(part));
    const p2 = current.split(".").map((part) => Number(part));
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const v1 = Number.isFinite(p1[i]) ? (p1[i] as number) : 0;
      const v2 = Number.isFinite(p2[i]) ? (p2[i] as number) : 0;
      if (v1 > v2) return true;
      if (v1 < v2) return false;
    }
    return false;
  }

  private static githubApiRequest(
    method: "GET" | "POST",
    apiPath: string,
    token: string,
    body?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: apiPath,
        method,
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "data7-publisher",
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
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
