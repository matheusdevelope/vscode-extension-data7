import * as fs from "fs";
import * as path from "path";
import { ManifestRegistry } from "./manifest-registry";
import { DependencySynchronizer } from "./dependency-synchronizer";
import {
  RepositoryQueryService,
  type RepositoryModuleEntry,
  type ModuleManifest,
} from "./repository-query-service";
import { parseBasic } from "../project/parser";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { logger } from "../infra/logger";
import { GitHubPublisher } from "./github-publisher";
import { isRecord, writeProjectConfig } from "../project/project-config";
import type { ProjectMetadata } from "../project/project-metadata";

export interface ModuleCatalogEntry {
  readonly name: string;
  readonly version: string;
  readonly source: "local" | "online";
  readonly installed: boolean;
  readonly installedVersion?: string;
  readonly updateAvailable: boolean;
  readonly isCurrentProject: boolean;
}

export interface ModuleOperationResult {
  readonly installed: string[];
  readonly updated: string[];
  readonly removed: string[];
  readonly synced: string[];
  readonly missing: string[];
}

export class ModuleOrchestrator {
  public static async listCatalog(workspaceDir: string): Promise<ModuleCatalogEntry[]> {
    const installed = this.readInstalledDependencies(workspaceDir);
    const currentModuleNames = this.readCurrentModuleNames(workspaceDir);
    const local = RepositoryQueryService.listLocalPrivateModules();
    const online = await RepositoryQueryService.listOnlineModuleEntries();
    return [...local, ...online].map((entry) => {
      const installedVersion = this.findDependencyVersion(installed, entry.name);
      const isCurrentProject = currentModuleNames.has(entry.name.toLowerCase());
      return {
        name: entry.name,
        version: entry.version,
        source: entry.source,
        installed: installedVersion !== undefined || isCurrentProject,
        installedVersion,
        updateAvailable:
          !isCurrentProject &&
          installedVersion !== undefined &&
          this.isNewerVersion(entry.version, installedVersion),
        isCurrentProject,
      };
    });
  }

  public static async installModules(
    workspaceDir: string,
    moduleNames: readonly string[],
  ): Promise<ModuleOperationResult> {
    const normalizedNames = this.normalizeModuleNames(moduleNames);
    if (normalizedNames.length === 0) return this.emptyResult();

    const currentModuleNames = this.readCurrentModuleNames(workspaceDir);
    const selfInstall = normalizedNames.find((name) => currentModuleNames.has(name.toLowerCase()));
    if (selfInstall) {
      throw new Error(
        `O módulo "${selfInstall}" é o próprio projeto ativo e não pode ser instalado como dependência dele mesmo.`,
      );
    }

    const dependencies = this.readInstalledDependencies(workspaceDir);
    const installed: string[] = [];
    const missing: string[] = [];

    for (const moduleName of normalizedNames) {
      const available = await this.resolveAvailableModule(moduleName);
      if (!available) {
        missing.push(moduleName);
        continue;
      }
      const existingName = this.findDependencyName(dependencies, available.name) ?? available.name;
      dependencies[existingName] = available.version;
      installed.push(`${available.name}@${available.version}`);
    }

    this.writeDependencies(workspaceDir, dependencies);
    const synced = await this.syncDependencies(workspaceDir);
    return { installed, updated: [], removed: [], synced, missing };
  }

  public static async updateModules(
    workspaceDir: string,
    moduleNames?: readonly string[],
  ): Promise<ModuleOperationResult> {
    const dependencies = this.readInstalledDependencies(workspaceDir);
    const targetNames =
      moduleNames && moduleNames.length > 0
        ? this.normalizeModuleNames(moduleNames)
        : Object.keys(dependencies);
    const updated: string[] = [];
    const missing: string[] = [];

    for (const moduleName of targetNames) {
      const dependencyName = this.findDependencyName(dependencies, moduleName);
      if (!dependencyName) {
        missing.push(moduleName);
        continue;
      }
      const available = await this.resolveAvailableModule(dependencyName);
      if (!available) {
        missing.push(dependencyName);
        continue;
      }
      if (this.isNewerVersion(available.version, dependencies[dependencyName] ?? "0.0.0.0")) {
        dependencies[dependencyName] = available.version;
        updated.push(`${dependencyName}@${available.version}`);
      }
    }

    this.writeDependencies(workspaceDir, dependencies);
    const synced = await this.syncDependencies(workspaceDir);
    return { installed: [], updated, removed: [], synced, missing };
  }

  public static async removeModules(
    workspaceDir: string,
    moduleNames: readonly string[],
  ): Promise<ModuleOperationResult> {
    const normalizedNames = this.normalizeModuleNames(moduleNames);
    if (normalizedNames.length === 0) return this.emptyResult();

    const dependencies = this.readInstalledDependencies(workspaceDir);
    const removed: string[] = [];
    const missing: string[] = [];
    for (const moduleName of normalizedNames) {
      const dependencyName = this.findDependencyName(dependencies, moduleName);
      if (!dependencyName) {
        missing.push(moduleName);
        continue;
      }
      delete dependencies[dependencyName];
      removed.push(dependencyName);
    }

    this.writeDependencies(workspaceDir, dependencies);
    const synced = await this.syncDependencies(workspaceDir);
    return { installed: [], updated: [], removed, synced, missing };
  }

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
      logger.warn(
        `Manifesto ${ManifestRegistry.FILENAME} não encontrado no workspace: ${workspaceDir}`,
      );
      return [];
    }

    const filteredDeps: Record<string, string> = {};
    const projectName = manifest.nome.toLowerCase();

    for (const [depName, version] of Object.entries(manifest.dependencies)) {
      // Rule: Protect active development module from being overwritten/synced to data7_modules.
      if (depName.toLowerCase() === projectName) {
        logger.info(
          `Ignorando sincronização para o módulo "${depName}" por ser o próprio projeto em desenvolvimento ativo.`,
        );
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
      throw new Error(
        `Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace: ${workspaceDir}`,
      );
    }

    if (!manifest.nome || typeof manifest.nome !== "string" || manifest.nome.trim() === "") {
      throw new Error(
        "O campo 'nome' no arquivo 'data7.json' é obrigatório e deve ser uma string não vazia.",
      );
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
          const errMsgs = result.errors
            .map((e: any) => `linha ${e.loc?.startLine ?? "?"}: ${e.message}`)
            .join("; ");
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
    onAuthPrompt: (userCode: string, verificationUri: string) => void,
  ): Promise<string> {
    return GitHubPublisher.publish(workspaceDir, onAuthPrompt);
  }

  public static async unpublishModuleOnline(
    moduleName: string,
    onAuthPrompt: (userCode: string, verificationUri: string) => void,
  ): Promise<string> {
    return GitHubPublisher.unpublish(moduleName, onAuthPrompt);
  }

  public static isNewerVersion(available: string, current: string): boolean {
    if (available === "latest") return current !== "latest";
    if (current === "latest") return false;
    const p1 = available.split(".").map((part) => Number(part));
    const p2 = current.split(".").map((part) => Number(part));
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const v1 = Number.isFinite(p1[i]) ? (p1[i] as number) : 0;
      const v2 = Number.isFinite(p2[i]) ? (p2[i] as number) : 0;
      if (v1 > v2) return true;
      if (v1 < v2) return false;
    }
    return false;
  }

  private static readInstalledDependencies(workspaceDir: string): Record<string, string> {
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      throw new Error(`Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace.`);
    }
    return { ...manifest.dependencies };
  }

  private static readCurrentModuleNames(workspaceDir: string): Set<string> {
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      throw new Error(`Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace.`);
    }
    const names = new Set<string>();
    if (manifest.nome.trim()) names.add(manifest.nome.trim().toLowerCase());
    const moduleConfig = manifest.raw.module;
    if (isRecord(moduleConfig) && typeof moduleConfig.name === "string") {
      const moduleName = moduleConfig.name.trim();
      if (moduleName) names.add(moduleName.toLowerCase());
    }
    return names;
  }

  private static writeDependencies(
    workspaceDir: string,
    dependencies: Record<string, string>,
  ): void {
    const manifestPath = path.join(workspaceDir, ManifestRegistry.FILENAME);
    const manifest = ManifestRegistry.read(manifestPath);
    if (!manifest) {
      throw new Error(`Manifesto '${ManifestRegistry.FILENAME}' não encontrado no workspace.`);
    }
    const updatedMetadata = {
      ...manifest.raw,
      dependencies,
    };
    writeProjectConfig(manifestPath, updatedMetadata as unknown as ProjectMetadata);
  }

  private static async resolveAvailableModule(
    moduleName: string,
  ): Promise<RepositoryModuleEntry | undefined> {
    const local = RepositoryQueryService.findLocalPrivateModule(moduleName);
    if (local) {
      return {
        name: this.manifestName(local.manifest, moduleName),
        source: "local",
        version: this.manifestVersion(local.manifest),
        manifest: local.manifest,
      };
    }
    const onlineManifest = await RepositoryQueryService.fetchOnlineModuleManifest(moduleName);
    if (onlineManifest) {
      return {
        name: this.manifestName(onlineManifest, moduleName),
        source: "online",
        version: this.manifestVersion(onlineManifest),
        manifest: onlineManifest,
      };
    }
    return undefined;
  }

  private static manifestName(manifest: ModuleManifest, fallback: string): string {
    return typeof manifest.nome === "string" && manifest.nome ? manifest.nome : fallback;
  }

  private static manifestVersion(manifest: ModuleManifest): string {
    if (typeof manifest.version === "string" && manifest.version) return manifest.version;
    const opcoes = manifest.opcoes;
    if (isRecord(opcoes) && typeof opcoes.versao === "string" && opcoes.versao) {
      return opcoes.versao;
    }
    return "latest";
  }

  private static normalizeModuleNames(moduleNames: readonly string[]): string[] {
    const unique = new Map<string, string>();
    for (const name of moduleNames) {
      const trimmed = name.trim();
      if (trimmed) unique.set(trimmed.toLowerCase(), trimmed);
    }
    return Array.from(unique.values());
  }

  private static findDependencyName(
    dependencies: Record<string, string>,
    moduleName: string,
  ): string | undefined {
    const expected = moduleName.toLowerCase();
    return Object.keys(dependencies).find((name) => name.toLowerCase() === expected);
  }

  private static findDependencyVersion(
    dependencies: Record<string, string>,
    moduleName: string,
  ): string | undefined {
    const dependencyName = this.findDependencyName(dependencies, moduleName);
    return dependencyName ? dependencies[dependencyName] : undefined;
  }

  private static emptyResult(): ModuleOperationResult {
    return { installed: [], updated: [], removed: [], synced: [], missing: [] };
  }
}
