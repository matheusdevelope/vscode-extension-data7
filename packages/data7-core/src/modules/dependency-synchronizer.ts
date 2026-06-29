import * as fs from "fs";
import * as path from "path";
import { RepositoryQueryService } from "./repository-query-service";
import { getCoreModulesPath } from "../infra/extension-paths";
import { logger } from "../infra/logger";

export class DependencySynchronizer {
  /**
   * Syncs all dependencies of the project at workspaceDir to its data7_modules/ folder.
   */
  public static async sync(
    workspaceDir: string,
    dependencies: Record<string, string>,
  ): Promise<string[]> {
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    if (!fs.existsSync(data7ModulesDir)) {
      fs.mkdirSync(data7ModulesDir, { recursive: true });
    }

    const synced: string[] = [];
    const activeDeps = Object.keys(dependencies);

    // 1. Sync alwaysSync core modules
    try {
      const coreSrc = getCoreModulesPath();
      const coreDest = path.join(data7ModulesDir, "core_modules");
      if (fs.existsSync(coreSrc)) {
        this.copyDirectorySync(coreSrc, coreDest);
      }
    } catch (err) {
      logger.error("Erro ao sincronizar módulos core padrão", err);
    }

    // 2. Sync project dependencies
    for (const depName of activeDeps) {
      const version = dependencies[depName] ?? "1.0.0.0";
      const depDestDir = path.join(data7ModulesDir, depName);

      try {
        // Step A: Check local private repo
        const localPrivate = RepositoryQueryService.findLocalPrivateModule(depName);
        if (localPrivate) {
          this.copyDirectorySync(localPrivate.dirPath, depDestDir);
          synced.push(`${depName} (💻 Local v${localPrivate.manifest.version})`);
          continue;
        }

        // Step B: Check online repo
        const onlineFiles = await RepositoryQueryService.fetchOnlineModuleFiles(depName);
        if (onlineFiles && onlineFiles.length > 0) {
          if (!fs.existsSync(depDestDir)) {
            fs.mkdirSync(depDestDir, { recursive: true });
          }
          for (const file of onlineFiles) {
            fs.writeFileSync(path.join(depDestDir, file.path), file.content, "utf-8");
          }
          synced.push(`${depName} (🌐 Online v${version})`);
          continue;
        }

        logger.warn(`Não foi possível sincronizar o módulo "${depName}" de nenhuma fonte.`);
      } catch (err) {
        logger.error(`Erro ao sincronizar módulo "${depName}"`, err);
      }
    }

    // 3. Cleanup unused modules in data7_modules
    const expectedDirs = new Set([...activeDeps, "core_modules"].map((d) => d.toLowerCase()));
    if (fs.existsSync(data7ModulesDir)) {
      const files = fs.readdirSync(data7ModulesDir);
      for (const file of files) {
        const fullPath = path.join(data7ModulesDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          if (!expectedDirs.has(file.toLowerCase())) {
            this.deleteDirectorySync(fullPath);
          }
        }
      }
    }

    return synced;
  }

  private static copyDirectorySync(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirectorySync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private static deleteDirectorySync(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          this.deleteDirectorySync(fullPath);
        } else {
          fs.unlinkSync(fullPath);
        }
      }
      fs.rmdirSync(dirPath);
    }
  }
}
