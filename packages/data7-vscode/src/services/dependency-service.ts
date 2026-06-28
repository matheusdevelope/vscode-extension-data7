import * as vscode from "vscode";
import { Builder, DependencyScanner, PROJECT_CONFIG_FILENAME, WorkspaceSymbolIndexer, getCoreModulesPath, logger, lookupSystemNamespaceOrClassByName, readProjectConfig } from "@data7/core";
import type { SharedModuleInfo } from "@data7/core";

import * as path from "path";
import * as fs from "fs";

import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { DiagnosticService } from "./diagnostic-service";

interface ProjectMetadataJson {
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readProjectMeta(configJsonPath: string): ProjectMetadataJson | undefined {
  try {
    const cfg = readProjectConfig(configJsonPath);
    // The narrowed `cfg.raw` is `Record<string, unknown>` which is
    // structurally assignable to `ProjectMetadataJson` (latter is the same
    // shape plus a typed `dependencies?` field). The mutation done by
    // callers (`projectMeta.dependencies ??= {}`) is safe because `raw`
    // owns the live object that will be serialised back to disk.
    return cfg?.raw;
  } catch (err) {
    logger.error(`Erro ao ler ${configJsonPath}.`, err);
    return undefined;
  }
}

/**
 * Outcome of a {@link DependencyService.detectAndSyncProjectDependencies}
 * pass. Callers use `missing` to decide whether to prompt the user to
 * import the missing module(s) into the repository.
 */
export interface DependencyDetectionResult {
  /** Module names that were copied/refreshed into `data7_modules/`. */
  synced: string[];
  /** Modules referenced by the project but not found in workspace or repo. */
  missing: string[];
}

export class DependencyService {
  private static readonly dependencyRefreshTimers = new Map<string, NodeJS.Timeout>();

  public static syncProjectData7Modules(
    workspaceDir: string,
    dependencies?: Record<string, string>,
  ): string[] {
    const srcDir = path.join(workspaceDir, "src");
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    const repoBasPath = RepositoryService.getRepoBasPath();
    const projectDeps = dependencies ?? this.readDependencies(workspaceDir);

    return DependencyScanner.syncDependencies(srcDir, data7ModulesDir, repoBasPath, projectDeps, {
      alwaysSyncDirs: [getCoreModulesPath()],
    });
  }

  /**
   * Detects modules referenced by the project and syncs the corresponding
   * `.bas` files into `data7_modules/`. Updates `data7.json#dependencies` when
   * new modules are discovered or stale ones removed.
   *
   * Returns both the synced modules and the still-missing ones. By default a
   * warning toast is shown when `missing` is non-empty — pass
   * `{ silent: true }` when the caller plans to surface its own UI (e.g.
   * `openProject` offers to import them).
   */
  public static detectAndSyncProjectDependencies(
    workspaceDir: string,
    opts: { silent?: boolean } = {},
  ): Promise<DependencyDetectionResult> {
    return Promise.resolve(this.detectAndSyncProjectDependenciesSync(workspaceDir, opts));
  }

  private static detectAndSyncProjectDependenciesSync(
    workspaceDir: string,
    opts: { silent?: boolean } = {},
  ): DependencyDetectionResult {
    const empty: DependencyDetectionResult = { synced: [], missing: [] };
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath);
    if (!projectMeta) return empty;
    projectMeta.dependencies ??= {};

    const srcDir = path.join(workspaceDir, "src");
    if (!fs.existsSync(srcDir)) return empty;

    const repoBasPath = RepositoryService.getRepoBasPath();
    const coreModulesPath = getCoreModulesPath();
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    const localCopiedModules = DependencyScanner.scanLocalModuleCopies(data7ModulesDir);
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
    const coreModules = DependencyScanner.scanSharedModules(coreModulesPath);
    const availableModules = new Map(localCopiedModules);
    for (const [key, info] of sharedModules.entries()) {
      availableModules.set(key, info);
    }
    for (const [key, info] of coreModules.entries()) {
      availableModules.set(key, info);
    }

    const basFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas"]);
    const localModules = DependencyScanner.getLocalModuleNames(srcDir);
    const knownTypes = DependencyScanner.getLocalTypeNames(srcDir);
    const knownValues = DependencyScanner.getLocalValueNames(srcDir);
    for (const info of availableModules.values()) {
      if (!info.code) continue;
      try {
        for (const typeName of DependencyScanner.getDeclaredTypeNames(info.code)) {
          knownTypes.add(typeName.toLowerCase());
        }
      } catch {
        /* Ignore unparsable repository modules during dependency discovery. */
      }
    }

    const filesToScan: string[] = [...basFiles];
    const scannedFiles = new Set<string>();
    const resolvedDependencies = new Map<string, SharedModuleInfo>();
    const missingModules = new Set<string>();

    const processReferencedModuleName = (rawModName: string, isExplicit: boolean): void => {
      if (DependencyScanner.isIgnoredNamespace(rawModName)) return;
      const lowerModName = rawModName.toLowerCase();
      if (localModules.has(lowerModName)) return;
      if (!isExplicit && knownTypes.has(lowerModName)) return;
      if (!isExplicit && knownValues.has(lowerModName)) return;
      // Mirror the guard from DiagnosticService.validateModuleReference: names
      // that resolve to a System Library namespace or class are always available
      // built-in and should never be flagged as missing user modules.
      if (!isExplicit && lookupSystemNamespaceOrClassByName(rawModName).length > 0) return;

      const resolvedKey = lowerModName;
      const found = availableModules.has(resolvedKey);

      if (found) {
        const resolvedInfo = availableModules.get(resolvedKey);
        if (resolvedInfo && !resolvedDependencies.has(resolvedKey)) {
          resolvedDependencies.set(resolvedKey, resolvedInfo);
          filesToScan.push(resolvedInfo.sourceFilePath);
        }
      } else {
        missingModules.add(rawModName);
      }
    };

    while (filesToScan.length > 0) {
      const currentFilePath = filesToScan.shift();
      if (!currentFilePath) break;
      const lowerPath = currentFilePath.toLowerCase();
      if (scannedFiles.has(lowerPath)) continue;
      scannedFiles.add(lowerPath);

      try {
        const fileContent = fs.readFileSync(currentFilePath, "utf-8");
        for (const reference of DependencyScanner.collectModuleReferences(fileContent)) {
          const namespace = reference.isExplicit
            ? (reference.name.split(".")[0] ?? reference.name)
            : reference.name;
          processReferencedModuleName(namespace, reference.isExplicit);
        }
      } catch (err) {
        logger.error(`Erro ao escanear ${currentFilePath} para dependências.`, err);
      }
    }

    const existingDeps = projectMeta.dependencies ?? {};
    let dependenciesUpdated = false;
    const newDeps: Record<string, string> = {};

    for (const [key, info] of resolvedDependencies.entries()) {
      if (coreModules.has(key)) continue;
      const actualName = info.moduleName;
      const version = info.version ?? "1.0.0.0";
      newDeps[actualName.toLowerCase()] = version;
      if (!existingDeps[actualName.toLowerCase()]) {
        dependenciesUpdated = true;
        logger.info(`Auto-detectada dependência: ${actualName} (adicionada ao data7.json)`);
      }
    }

    for (const existingKey of Object.keys(existingDeps)) {
      const lowerExistingKey = existingKey.toLowerCase();
      if (!newDeps[lowerExistingKey]) {
        const isReferencedAsMissing = Array.from(missingModules).some(
          (m) => m.toLowerCase() === lowerExistingKey
        );
        if (
          isReferencedAsMissing ||
          (localCopiedModules.has(lowerExistingKey) &&
            !sharedModules.has(lowerExistingKey) &&
            !coreModules.has(lowerExistingKey))
        ) {
          newDeps[lowerExistingKey] = existingDeps[existingKey] ?? "1.0.0.0";
          continue;
        }
        dependenciesUpdated = true;
        logger.info(`Removendo dependência não referenciada: ${existingKey}`);
      }
    }

    projectMeta.dependencies = newDeps;
    if (dependenciesUpdated) {
      try {
        fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");
      } catch (err) {
        logger.error("Erro ao escrever data7.json atualizado.", err);
      }
    }

    const synced = this.syncProjectData7Modules(workspaceDir, projectMeta.dependencies);

    const missing = Array.from(missingModules);
    if (missing.length > 0 && !opts.silent) {
      vscode.window.showWarningMessage(
        `Os seguintes módulos referenciados não foram encontrados no repositório nem no projeto local: ${missing.join(", ")}`,
      );
    }

    return { synced, missing };
  }

  private static readDependencies(workspaceDir: string): Record<string, string> {
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath);
    return projectMeta?.dependencies ? { ...projectMeta.dependencies } : {};
  }

  /**
   * Refreshes the active project after an out-of-band change to its
   * dependency surface (typically a module import into the private
   * repository, an `installModule` call, or an `updateDependencies` run).
   *
   * The sequence is:
   *
   *   1. Re-scan and copy resolved shared modules into `data7_modules/`.
   *      `detectAndSyncProjectDependencies` also rewrites
   *      `data7.json#dependencies` when new modules become resolvable.
   *   2. Re-build the `.7Proj` so the executor sees the new files. The build
   *      can legitimately fail mid-setup (missing Principal.bas, malformed
   *      `data7.json`); failures are logged but do NOT abort the refresh.
   *   3. Re-index ONLY `data7_modules/` instead of the whole workspace —
   *      the project's own `src/` is already kept in sync by the live
   *      `.bas` file watcher (`extension.ts#registerWorkspaceListeners`),
   *      so a full `indexWorkspace` would do redundant work on every
   *      import.
   *   4. Refresh diagnostics on every visible editor so missing-import /
   *      unused-import warnings disappear immediately.
   *
   * Safe to call when no project is active — returns early.
   *
   * @param opts.silent  Suppress the foreground progress indicator. Used by
   *                     synchronous workflows that already own a withProgress
   *                     scope (e.g. inside `installModule`).
   */
  public static async refreshActiveProject(opts: { silent?: boolean } = {}): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) return;

    const work = async (): Promise<void> => {
      await this.detectAndSyncProjectDependencies(project.workspaceDir);
      try {
        Builder.buildProject(project.workspaceDir, project.projectFilePath);
      } catch (err: unknown) {
        logger.warn(
          `Falha ao recompilar projeto após importação: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
      if (fs.existsSync(data7ModulesDir)) {
        await WorkspaceSymbolIndexer.getInstance().indexDirectory(data7ModulesDir);
      }
      DiagnosticService.refreshAllActive();
    };

    try {
      if (opts.silent) {
        await work();
      } else {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Atualizando contexto do projeto Data7…",
            cancellable: false,
          },
          () => work(),
        );
      }
    } catch (err: unknown) {
      logger.error("Falha ao atualizar contexto do projeto após importação.", err);
    }
  }

  public static scheduleWorkspaceDependencyRefresh(workspaceDir: string): void {
    const key = path.normalize(workspaceDir).toLowerCase();
    const existing = this.dependencyRefreshTimers.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.dependencyRefreshTimers.delete(key);
      void this.refreshWorkspaceDependencies(workspaceDir).catch((err: unknown) => {
        logger.error(
          `Falha ao sincronizar dependências do projeto ${workspaceDir} após alteração local.`,
          err,
        );
      });
    }, 350);
    this.dependencyRefreshTimers.set(key, timer);
  }

  public static async refreshWorkspaceDependencies(
    workspaceDir: string,
  ): Promise<DependencyDetectionResult> {
    const result = await this.detectAndSyncProjectDependencies(workspaceDir, { silent: true });
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    const indexer = WorkspaceSymbolIndexer.getInstance();
    indexer.deleteWorkspaceFolder(path.normalize(data7ModulesDir).toLowerCase());
    if (fs.existsSync(data7ModulesDir)) {
      await indexer.indexDirectory(data7ModulesDir);
    }
    DiagnosticService.invalidateWorkspaceCacheFor(path.join(workspaceDir, PROJECT_CONFIG_FILENAME));
    DiagnosticService.refreshAllActive();
    return result;
  }

  /** Manual install of a shared module from the repository into the active project. */
  public static async installModule(moduleName?: string): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado para instalar dependências.",
      );
      return;
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
    if (sharedModules.size === 0) {
      vscode.window.showErrorMessage(
        "Nenhum módulo compartilhado foi encontrado no repositório configurado.",
      );
      return;
    }

    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    projectMeta.dependencies ??= {};
    const projectDeps = projectMeta.dependencies;

    if (moduleName) {
      const info = sharedModules.get(moduleName.toLowerCase());
      if (!info) {
        vscode.window.showErrorMessage(`Módulo "${moduleName}" não encontrado no repositório.`);
        return;
      }
      const versionString = info.version ?? "1.0.0.0";
      projectDeps[moduleName.toLowerCase()] = versionString;
      fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");
      try {
        await this.refreshActiveProject();
      } catch (err: unknown) {
        logger.error("Falha ao atualizar dependências após instalação automática.", err);
      }
      return;
    }

    const quickPickItems = Array.from(sharedModules.values()).map((info) => {
      const isAlreadyInstalled = !!projectDeps[info.moduleName.toLowerCase()];
      return {
        label: info.moduleName,
        description:
          `v${info.version ?? "1.0.0.0"}` + (isAlreadyInstalled ? " (já instalado)" : ""),
        detail: `Origem: ${path.basename(info.sourceFilePath)}`,
      };
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Selecione o módulo compartilhado para instalar no projeto",
      ignoreFocusOut: true,
    });
    if (!selected) return;

    const versionString = (selected.description.split(" ")[0] ?? "").replace(/^v/, "");
    projectDeps[selected.label.toLowerCase()] = versionString;
    fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");

    try {
      // Delegate sync + build + reindex + diagnostics refresh to the shared
      // helper so this entry point cannot drift away from the canonical
      // post-mutation pipeline (see `refreshActiveProject`).
      await this.refreshActiveProject();
      vscode.window.showInformationMessage(
        `Módulo "${selected.label}" v${versionString} instalado e compilado com sucesso!`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha na instalação/build do módulo.", err);
      vscode.window.showErrorMessage(`Falha na instalação/build do módulo: ${message}`);
    }
  }

  /** Install multiple shared modules from the repository into the active project in bulk. */
  public static async installModules(moduleNames: string[]): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) return;

    const repoBasPath = RepositoryService.getRepoBasPath();
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
    if (sharedModules.size === 0) return;

    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    projectMeta.dependencies ??= {};
    const projectDeps = projectMeta.dependencies;

    let addedAny = false;
    for (const name of moduleNames) {
      const info = sharedModules.get(name.toLowerCase());
      if (info) {
        const lowerName = name.toLowerCase();
        if (!projectDeps[lowerName]) {
          projectDeps[lowerName] = info.version ?? "1.0.0.0";
          addedAny = true;
        }
      }
    }

    if (addedAny) {
      fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");
      try {
        await this.refreshActiveProject();
      } catch (err: unknown) {
        logger.error("Falha ao atualizar dependências em massa.", err);
      }
    }
  }

  /** Pulls fresh copies of declared dependencies from the repository. */
  public static async updateDependencies(): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado para atualizar dependências.",
      );
      return;
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configJsonPath)) {
      vscode.window.showErrorMessage("Projeto data7.json não encontrado.");
      return;
    }

    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    const deps = projectMeta.dependencies ?? {};
    if (Object.keys(deps).length === 0) {
      await this.refreshActiveProject();
      vscode.window.showInformationMessage(
        "Módulos core sincronizados. Nenhuma dependência declarada em data7.json.",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Atualizando dependências do projeto...",
        cancellable: true,
      },
      async (_progress, token) => {
        if (token.isCancellationRequested) return;
        try {
          const sharedModulesBefore = DependencyScanner.scanSharedModules(repoBasPath);

          // refreshActiveProject runs the full sync + build + reindex +
          // diagnostics pipeline. We pass `silent: true` to avoid stacking
          // a second progress UI on top of this one.
          await this.refreshActiveProject({ silent: true });
          // Token state can change during the awaited work above.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (token.isCancellationRequested) return;

          // Re-read the (possibly mutated) project metadata to report what
          // was actually synced. `refreshActiveProject` is the source of
          // truth for the `data7_modules/` content.
          const refreshedMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
          const refreshedDeps = refreshedMeta.dependencies ?? {};
          const updatedList = Object.keys(refreshedDeps).map((name) => {
            const info = sharedModulesBefore.get(name.toLowerCase());
            return `${info?.moduleName ?? name} (v${info?.version ?? refreshedDeps[name] ?? "1.0.0.0"})`;
          });

          if (updatedList.length > 0) {
            vscode.window.showInformationMessage(
              `Dependências atualizadas com sucesso: ${updatedList.join(", ")}`,
            );
          } else {
            vscode.window.showInformationMessage("Todas as dependências já estão atualizadas.");
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Falha ao atualizar dependências.", err);
          vscode.window.showErrorMessage(`Falha ao atualizar dependências: ${message}`);
        }
      },
    );
  }

  /**
   * Scans the project for external namespace/class references that are not declared
   * in data7.json dependencies, and prompts the user to add/install them.
   */
  public static async suggestAndInstallDetectedDependencies(
    workspaceDir: string,
    opts: { silent?: boolean } = {}
  ): Promise<void> {
    // Auto-scan and suggest dependencies is temporarily disabled.
    // Namespaces do not map 1-to-1 to module packages (a single module can contain multiple namespaces),
    // so scanning and mapping every external namespace to a module package version creates incorrect suggestions.
    if (!opts.silent) {
      vscode.window.showInformationMessage("A varredura automática de dependências sugeridas está temporariamente desativada.");
    }
    return;
    /*
    const srcDir = path.join(workspaceDir, "src");
    if (!fs.existsSync(srcDir)) return;

    const basFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas"]);
    const localModules = DependencyScanner.getLocalModuleNames(srcDir);
    const knownTypes = DependencyScanner.getLocalTypeNames(srcDir);
    const knownValues = DependencyScanner.getLocalValueNames(srcDir);

    const detectedExternalNamespaces = new Set<string>();

    for (const currentFilePath of basFiles) {
      try {
        const fileContent = fs.readFileSync(currentFilePath, "utf-8");
        for (const reference of DependencyScanner.collectModuleReferences(fileContent)) {
          const namespace = reference.isExplicit
            ? (reference.name.split(".")[0] ?? reference.name)
            : reference.name;

          if (DependencyScanner.isIgnoredNamespace(namespace)) continue;
          const lowerNS = namespace.toLowerCase();
          if (localModules.has(lowerNS)) continue;
          if (!reference.isExplicit && knownTypes.has(lowerNS)) continue;
          if (!reference.isExplicit && knownValues.has(lowerNS)) continue;
          if (!reference.isExplicit && lookupSystemNamespaceOrClassByName(namespace).length > 0) continue;

          detectedExternalNamespaces.add(namespace);
        }
      } catch (err) {
        logger.error(`Erro ao escanear ${currentFilePath} para dependências sugeridas.`, err);
      }
    }

    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    projectMeta.dependencies ??= {};
    const projectDeps = projectMeta.dependencies;

    const missingDeclarations = Array.from(detectedExternalNamespaces).filter(
      ns => !projectDeps[ns.toLowerCase()]
    );

    if (missingDeclarations.length === 0) {
      if (!opts.silent) {
        vscode.window.showInformationMessage("Todas as dependências externas usadas no código já estão declaradas.");
      }
      return;
    }

    const runQuickPick = async () => {
      const selected = await vscode.window.showQuickPick(
        missingDeclarations.map(ns => ({
          label: ns,
          picked: true,
          description: "Adicionar como dependência do projeto",
        })),
        {
          placeHolder: "Selecione os namespaces externos para adicionar como dependências de módulo",
          canPickMany: true,
          ignoreFocusOut: true,
        }
      );

      if (!selected || selected.length === 0) return;

      for (const item of selected) {
        projectDeps[item.label.toLowerCase()] = "latest";
      }

      fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Adicionando e sincronizando novas dependências...",
          cancellable: false,
        },
        async () => {
          await this.refreshWorkspaceDependencies(workspaceDir);
        }
      );

      vscode.window.showInformationMessage(
        `Dependências adicionadas e sincronizadas com sucesso: ${selected.map(item => item.label).join(", ")}`
      );
    };

    if (opts.silent) {
      const action = await vscode.window.showWarningMessage(
        `Detectamos namespaces externos usados no código que não estão em data7.json: ${missingDeclarations.join(", ")}.`,
        "Adicionar como Dependências",
        "Ignorar"
      );
      if (action === "Adicionar como Dependências") {
        await runQuickPick();
      }
    } else {
      await runQuickPick();
    }
    */
  }
}
