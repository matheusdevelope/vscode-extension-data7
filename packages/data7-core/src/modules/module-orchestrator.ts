import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { ManifestRegistry } from "./manifest-registry";
import { DependencySynchronizer } from "./dependency-synchronizer";
import { RepositoryQueryService } from "./repository-query-service";
import { parseBasic } from "../project/parser";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { logger } from "../infra/logger";
import { getOnlineModulesLocalPath } from "../infra/extension-paths";
import { GitHubPublisher } from "./github-publisher";


export class ModuleOrchestrator {
  /**
   * Returns true if the given module name matches the active project name in the workspace.
   */
  public static isUnderActiveDevelopment(workspaceDir: string, moduleName: string): boolean {
    try {
      const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
      const manifest = ManifestRegistry.read(manifestPath);
      if (manifest && manifest.nome.toLowerCase() === moduleName.toLowerCase()) {
        return true;
      }
    } catch (err) {
      logger.error("Erro ao verificar módulo em desenvolvimento ativo", err);
    }
    return false;
  }

  /**
   * Syncs dependencies for the active project, applying protection to active development modules.
   */
  public static async syncDependencies(workspaceDir: string): Promise<string[]> {
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      logger.warn(`Manifesto ${ManifestRegistry.FILENAME} não encontrado no workspace: ${workspaceDir}`);
      return [];
    }

    const filteredDeps: Record<string, string> = {};
    const projectName = manifest.nome.toLowerCase();

    for (const [depName, version] of Object.entries(manifest.dependencies)) {
      // Rule: Protect active development module from being overwritten/synced to data7_modules.
      if (depName.toLowerCase() === projectName) {
        logger.info(`Ignorando sincronização para o módulo "${depName}" por ser o próprio projeto em desenvolvimento ativo.`);
        continue;
      }
      filteredDeps[depName] = version;
    }

    return DependencySynchronizer.sync(workspaceDir, filteredDeps);
  }

  /**
   * Publishes the module under workspaceDir locally to the private repository.
   * Performs validation on the manifest, workspace structure, and parser check on code.
   */
  public static async publishModuleLocally(workspaceDir: string): Promise<void> {
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

    const targetBaseDir = RepositoryQueryService.getLocalPrivateModulesPath();
    const targetModuleDir = path.join(targetBaseDir, moduleName.toLowerCase());

    if (fs.existsSync(targetModuleDir)) {
      fs.rmSync(targetModuleDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetModuleDir, { recursive: true });

    fs.copyFileSync(manifestPath, path.join(targetModuleDir, ManifestRegistry.FILENAME));

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

    logger.info(`Módulo '${moduleName}' publicado localmente com sucesso em: ${targetModuleDir}`);
  }

  /**
   * Publishes the module under workspaceDir online to the public remote repository.
   * Performs validation, forks the repo, pushes to the fork and opens a Pull Request.
   */
  public static async publishModuleOnline(
    workspaceDir: string,
    onAuthPrompt: (userCode: string, verificationUri: string) => void
  ): Promise<string> {
    return GitHubPublisher.publish(workspaceDir, onAuthPrompt);
  }
}

