import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { SharedModuleInfo } from "../analysis/dependency-scanner";
import { DependencyScanner, IMPORTS_REGEX } from "../analysis/dependency-scanner";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { Builder } from "../project/builder";
import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { DiagnosticService } from "./diagnostic-service";
import { logger } from "../infra/logger";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";
import { readProjectConfig } from "../project/project-config";

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
    if (!repoBasPath || !fs.existsSync(repoBasPath)) return empty;

    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);

    const localModules = new Set<string>();
    const basFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas"]);
    for (const file of basFiles) {
      const filename = path.basename(file, ".bas");
      localModules.add(filename.toLowerCase());
      try {
        const content = fs.readFileSync(file, "utf-8");
        const nsMatch = /\bNamespace\s+([a-zA-Z0-9_]+)/i.exec(content);
        const ns = nsMatch?.[1];
        if (ns) {
          localModules.add(ns.toLowerCase());
        }
      } catch (err) {
        logger.warn(`Falha ao ler ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const filesToScan: string[] = [...basFiles];
    const scannedFiles = new Set<string>();
    const resolvedDependencies = new Map<string, SharedModuleInfo>();
    const missingModules = new Set<string>();

    const importsRegex = IMPORTS_REGEX;
    const directCallRegex = /\b(mod_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+)(?=\.)/i;

    const processReferencedModuleName = (rawModName: string, isExplicit: boolean): void => {
      if (DependencyScanner.isIgnoredNamespace(rawModName)) return;
      const lowerModName = rawModName.toLowerCase();
      if (localModules.has(lowerModName)) return;

      let resolvedKey = lowerModName;
      let found = sharedModules.has(resolvedKey);
      if (!found) {
        if (sharedModules.has("mod_" + resolvedKey)) {
          resolvedKey = "mod_" + resolvedKey;
          found = true;
        } else if (resolvedKey.startsWith("mod_") && sharedModules.has(resolvedKey.substring(4))) {
          resolvedKey = resolvedKey.substring(4);
          found = true;
        }
      }

      if (found) {
        const resolvedInfo = sharedModules.get(resolvedKey);
        if (resolvedInfo && !resolvedDependencies.has(resolvedKey)) {
          resolvedDependencies.set(resolvedKey, resolvedInfo);
          filesToScan.push(resolvedInfo.sourceFilePath);
        }
      } else if (isExplicit || lowerModName.startsWith("mod_")) {
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
        const lines = fileContent.split(/\r?\n/);
        for (const lineText of lines) {
          const cleanLine = DependencyScanner.stripComments(lineText);
          if (!cleanLine.trim()) continue;
          const match = cleanLine.match(importsRegex);
          if (match?.[1]) processReferencedModuleName(match[1], true);
          const dMatch = directCallRegex.exec(cleanLine);
          if (dMatch?.[1]) processReferencedModuleName(dMatch[1], false);
        }
      } catch (err) {
        logger.error(`Erro ao escanear ${currentFilePath} para dependências.`, err);
      }
    }

    const existingDeps = projectMeta.dependencies ?? {};
    let dependenciesUpdated = false;
    const newDeps: Record<string, string> = {};

    for (const [, info] of resolvedDependencies.entries()) {
      const actualName = info.moduleName;
      const version = info.version ?? "1.0.0.0";
      newDeps[actualName.toLowerCase()] = version;
      if (!existingDeps[actualName.toLowerCase()]) {
        dependenciesUpdated = true;
        logger.info(`Auto-detectada dependência: ${actualName} (adicionada ao data7.json)`);
      }
    }

    for (const existingKey of Object.keys(existingDeps)) {
      if (!newDeps[existingKey.toLowerCase()]) {
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

    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    const synced = DependencyScanner.syncDependencies(
      srcDir,
      data7ModulesDir,
      repoBasPath,
      projectMeta.dependencies,
    );

    const missing = Array.from(missingModules);
    if (missing.length > 0 && !opts.silent) {
      vscode.window.showWarningMessage(
        `Os seguintes módulos referenciados não foram encontrados no repositório nem no projeto local: ${missing.join(", ")}`,
      );
    }

    return { synced, missing };
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

  /** Manual install of a shared module from the repository into the active project. */
  public static async installModule(): Promise<void> {
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
      vscode.window.showWarningMessage("Nenhuma dependência declarada em data7.json.");
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
}
