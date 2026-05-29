import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Decompiler } from "../project/decompiler";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { Builder } from "../project/builder";
import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { DependencyService } from "./dependency-service";
import { DiagnosticService } from "./diagnostic-service";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { logger } from "../infra/logger";
import { readConfiguration } from "../infra/configuration";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";
import { readProjectConfig } from "../project/project-config";
import { debounce } from "../utils/debounce";

/**
 * Bidirectional sync between the workspace tree and the external `.7Proj`
 * file. All file events are debounced so bursts of saves (git checkout, rapid
 * formatting) trigger at most one rebuild (performance.mdc).
 */
export class SyncWatcher {
  public static isAutoSyncEnabled = false;
  private static _isBuilding = false;
  private static _selfBuiltProjMtimes = new Map<string, number>();
  private static _ignoreBasChangesUntil = 0;
  private static _ignoreProjChangesUntil = 0;
  private static _externalFileWatcher: vscode.FileSystemWatcher | undefined;
  private static readonly REBUILD_DELAY_MS = 400;

  /**
   * Resolves the synchronization mode for the project:
   * 1. Check data7.json's "sincronizacao.modo"
   * 2. Fall back to VS Code settings "data7.sincronizacao.modo"
   * 3. Fall back to "data7.enableAutoSync"
   */
  private static getSyncMode(projectFilePath?: string): string {
    if (projectFilePath) {
      const workspaceDir = path.dirname(projectFilePath);
      const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
      try {
        const cfg = readProjectConfig(configJsonPath);
        if (
          cfg?.raw &&
          typeof cfg.raw.sincronizacao === "object" &&
          cfg.raw.sincronizacao !== null
        ) {
          const syncBlock = cfg.raw.sincronizacao as Record<string, unknown>;
          if (typeof syncBlock.modo === "string" && syncBlock.modo) {
            return syncBlock.modo.toLowerCase();
          }
        }
      } catch {
        // ignore and fall back to extension settings
      }
    }
    const config = readConfiguration();
    if (typeof config.sincronizacao.modo === "string") {
      return config.sincronizacao.modo.toLowerCase();
    }
    return config.enableAutoSync ? "estrutura <> projeto.7proj" : "disabled";
  }

  /**
   * Watches the external `.7Proj` file and re-decomposes it when it changes
   * outside the IDE (e.g. when the user edits it in the Data7 Developer Studio).
   */
  public static watchExternalProjectFile(projectFilePath: string, hiddenFolderDir: string): void {
    if (!this.isAutoSyncEnabled) return;
    this.disposeExternalWatcher();
    const watcher = vscode.workspace.createFileSystemWatcher(projectFilePath);
    this._externalFileWatcher = watcher;

    const handlerImpl = async (): Promise<void> => {
      const syncMode = this.getSyncMode(projectFilePath);
      const isDecompileEnabled =
        syncMode === "estrutura <> projeto.7proj" || syncMode === "projeto.7proj > estrutura";
      if (!isDecompileEnabled) return;

      if (this._isBuilding) return;

      if (Date.now() < this._ignoreProjChangesUntil) {
        return; // Ignore events triggered by our own builds
      }

      if (fs.existsSync(projectFilePath)) {
        const currentMtime = fs.statSync(projectFilePath).mtimeMs;
        const pathKey = projectFilePath.toLowerCase();
        const lastSelfMtime = this._selfBuiltProjMtimes.get(pathKey);
        if (lastSelfMtime !== undefined && Math.abs(currentMtime - lastSelfMtime) < 2000) {
          // Ignore external file watcher trigger since it matches our own build's timestamp
          return;
        }
      }

      this._isBuilding = true;
      try {
        const repoBasPath = RepositoryService.getRepoBasPath();
        let knownSharedModules: Set<string> | undefined;
        if (repoBasPath && fs.existsSync(repoBasPath)) {
          try {
            const synced = DependencyScanner.syncDependencies(
              path.join(hiddenFolderDir, "src"),
              path.join(hiddenFolderDir, "data7_modules"),
              repoBasPath,
              {},
            );
            knownSharedModules = new Set(synced);
          } catch (err) {
            logger.warn(
              `Falha em syncDependencies durante decompose: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // Set ignore flag to ignore .bas changes triggered by decompiling
        this._ignoreBasChangesUntil = Date.now() + 5000;

        Decompiler.decompileProject(projectFilePath, hiddenFolderDir, knownSharedModules);

        let dependencies: Record<string, string> = {};
        const configJsonPath = path.join(hiddenFolderDir, PROJECT_CONFIG_FILENAME);
        try {
          const cfg = readProjectConfig(configJsonPath);
          if (cfg) dependencies = { ...cfg.dependencies };
        } catch (err) {
          logger.warn(
            `Falha ao ler data7.json após decompose: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        if (repoBasPath && fs.existsSync(repoBasPath)) {
          DependencyScanner.syncDependencies(
            path.join(hiddenFolderDir, "src"),
            path.join(hiddenFolderDir, "data7_modules"),
            repoBasPath,
            dependencies,
          );
        }

        await WorkspaceSymbolIndexer.getInstance().indexWorkspace(
          vscode.workspace.workspaceFolders,
        );
        DiagnosticService.refreshAllActive();
        logger.info(`Projeto sincronizado a partir de alteração externa: ${projectFilePath}`);
      } catch (err: unknown) {
        logger.error("Falha ao decompor alteração externa.", err);
      } finally {
        this._isBuilding = false;
        // Keep ignoring .bas changes for a short cooldown to let pending OS events settle
        this._ignoreBasChangesUntil = Date.now() + 5000;
      }
    };

    // `debounce` wants a synchronous `(...args) => void` function. We wrap
    // the async impl so the promise is intentionally discarded.
    const handler = debounce(() => {
      void handlerImpl();
    }, this.REBUILD_DELAY_MS);

    watcher.onDidChange(handler);
    watcher.onDidCreate(handler);
  }

  /**
   * Starts the bidirectional workspace watcher.
   */
  public static startAutoSync(context: vscode.ExtensionContext): void {
    if (!this.isAutoSyncEnabled) return;
    const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.bas");
    const jsonWatcher = vscode.workspace.createFileSystemWatcher("**/data7.json");

    const handleFileChangeImpl = async (uri: vscode.Uri): Promise<void> => {
      if (Date.now() < this._ignoreBasChangesUntil) {
        return; // Ignore events triggered by decompilation writes
      }

      const paths = ProjectService.findProjectPaths(uri.fsPath);
      if (!paths) return;

      const syncMode = this.getSyncMode(paths.projectFilePath);
      const isCompileEnabled =
        syncMode === "estrutura <> projeto.7proj" || syncMode === "estrutura > projeto.7proj";
      if (!isCompileEnabled) return;

      const repoBasPath = RepositoryService.getRepoBasPath();
      if (!repoBasPath || !fs.existsSync(repoBasPath)) return;

      if (this._isBuilding) return;
      this._isBuilding = true;
      try {
        await DependencyService.detectAndSyncProjectDependencies(paths.workspaceDir);
        Builder.buildProject(paths.workspaceDir, paths.projectFilePath);

        // Record the mtimeMs of the .7Proj file we just compiled
        if (fs.existsSync(paths.projectFilePath)) {
          const mtime = fs.statSync(paths.projectFilePath).mtimeMs;
          this._selfBuiltProjMtimes.set(paths.projectFilePath.toLowerCase(), mtime);
        }

        // Set ignore flags to prevent loop/cascade events
        this._ignoreProjChangesUntil = Date.now() + 5000;
        this._ignoreBasChangesUntil = Date.now() + 5000;

        await WorkspaceSymbolIndexer.getInstance().indexWorkspace(
          vscode.workspace.workspaceFolders,
        );
        logger.info(
          `Projeto '${path.basename(paths.projectFilePath)}' auto-recompilado com sucesso.`,
        );
      } catch (err: unknown) {
        logger.error("Falha na recompilação automática.", err);
      } finally {
        this._isBuilding = false;
      }
    };

    // Wrap the async impl in a sync function so `debounce` can use it and
    // VS Code's listener API receives a `void`-returning callback.
    const handleFileChange = debounce((uri: vscode.Uri) => {
      void handleFileChangeImpl(uri);
    }, this.REBUILD_DELAY_MS);

    basWatcher.onDidChange(handleFileChange);
    basWatcher.onDidCreate(handleFileChange);
    basWatcher.onDidDelete(handleFileChange);
    jsonWatcher.onDidChange(handleFileChange);
    context.subscriptions.push(basWatcher, jsonWatcher);
  }

  public static dispose(): void {
    this.disposeExternalWatcher();
  }

  private static disposeExternalWatcher(): void {
    if (this._externalFileWatcher) {
      this._externalFileWatcher.dispose();
      this._externalFileWatcher = undefined;
    }
  }
}
