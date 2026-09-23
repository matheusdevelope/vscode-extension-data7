import * as fs from "fs";
import * as path from "path";
import { RepositoryQueryService } from "./repository-query-service";
import { normalizeImportedModuleSources } from "./module-source-packaging";
import { ManifestRegistry } from "./manifest-registry";
import { getCoreModulesPath } from "../infra/extension-paths";
import { logger } from "../infra/logger";

export class DependencySynchronizer {
  /**
   * Syncs all dependencies of the project at workspaceDir to its data7_modules/ folder.
   * Direct deps and nested `data7.json#dependencies` of copied modules are included
   * (e.g. `mod_configurador` → `Tables`). Cycles are skipped.
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

    // 1. Sync alwaysSync core modules
    try {
      const coreSrc = getCoreModulesPath();
      const coreDest = path.join(data7ModulesDir, "core_modules");
      if (fs.existsSync(coreSrc)) {
        this.replaceDirectorySync(coreSrc, coreDest);
        normalizeImportedModuleSources(coreDest);
        synced.push("core_modules");
      }
    } catch (err) {
      logger.error("Erro ao sincronizar módulos core padrão", err);
    }

    // 2. Sync project dependencies, then nested dependencies of copied modules.
    const pending: Array<{ name: string; version: string }> = Object.entries(dependencies).map(
      ([name, version]) => ({ name, version }),
    );
    const queued = new Set(pending.map((item) => item.name.toLowerCase()));
    const expectedDirs = new Set<string>(["core_modules"]);

    while (pending.length > 0) {
      const current = pending.shift();
      if (!current) continue;
      expectedDirs.add(current.name.toLowerCase());
      const copied = await this.syncOneModule(
        current.name,
        current.version,
        data7ModulesDir,
        synced,
      );
      if (!copied) continue;
      for (const [nestedName, nestedVersion] of Object.entries(
        this.readCopiedDependencies(path.join(data7ModulesDir, current.name)),
      )) {
        const key = nestedName.toLowerCase();
        if (key === "core_modules" || queued.has(key)) continue;
        queued.add(key);
        pending.push({ name: nestedName, version: nestedVersion });
      }
    }

    // 3. Cleanup unused modules in data7_modules
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

  private static async syncOneModule(
    depName: string,
    version: string,
    data7ModulesDir: string,
    synced: string[],
  ): Promise<boolean> {
    const depDestDir = path.join(data7ModulesDir, depName);
    try {
      const localPrivate = RepositoryQueryService.findLocalPrivateModule(depName);
      if (localPrivate) {
        this.replaceDirectorySync(localPrivate.dirPath, depDestDir);
        normalizeImportedModuleSources(depDestDir);
        synced.push(`${depName} (💻 Local v${localPrivate.manifest.version})`);
        return true;
      }

      const onlineFiles = await RepositoryQueryService.fetchOnlineModuleFiles(depName);
      if (onlineFiles && onlineFiles.length > 0) {
        this.deleteDirectorySync(depDestDir);
        fs.mkdirSync(depDestDir, { recursive: true });
        for (const file of onlineFiles) {
          const destPath = path.join(depDestDir, file.path);
          const destDir = path.dirname(destPath);
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
          }
          fs.writeFileSync(destPath, file.content, "utf-8");
        }
        normalizeImportedModuleSources(depDestDir);
        synced.push(`${depName} (🌐 Online v${version})`);
        return true;
      }

      logger.warn(`Não foi possível sincronizar o módulo "${depName}" de nenhuma fonte.`);
      return false;
    } catch (err) {
      logger.error(`Erro ao sincronizar módulo "${depName}"`, err);
      return false;
    }
  }

  private static readCopiedDependencies(moduleDir: string): Record<string, string> {
    const manifestPath = path.join(moduleDir, ManifestRegistry.FILENAME);
    try {
      const manifest = ManifestRegistry.read(manifestPath);
      return manifest ? { ...manifest.dependencies } : {};
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logger.warn(`Não foi possível ler dependências de "${moduleDir}": ${detail}`);
      return {};
    }
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

  private static replaceDirectorySync(src: string, dest: string): void {
    this.deleteDirectorySync(dest);
    this.copyDirectorySync(src, dest);
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
