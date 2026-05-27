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
import { debounce } from "../utils/debounce";

/**
 * Bidirectional sync between the workspace tree and the external `.7Proj`
 * file. All file events are debounced so bursts of saves (git checkout, rapid
 * formatting) trigger at most one rebuild (performance.mdc).
 */
export class SyncWatcher {
  private static _isSyncing = false;
  private static _externalFileWatcher: vscode.FileSystemWatcher | undefined;
  private static readonly REBUILD_DELAY_MS = 400;

  private static acquireSyncLock(): boolean {
    if (this._isSyncing) return false;
    this._isSyncing = true;
    return true;
  }

  private static releaseSyncLock(): void {
    // Brief cooldown to absorb cascading filesystem events triggered by our
    // own writes before another sync starts.
    setTimeout(() => {
      this._isSyncing = false;
    }, 1000);
  }

  /**
   * Watches the external `.7Proj` file and re-decomposes it when it changes
   * outside the IDE (e.g. when the user edits it in the Data7 Developer Studio).
   */
  public static watchExternalProjectFile(projectFilePath: string, hiddenFolderDir: string): void {
    this.disposeExternalWatcher();
    const watcher = vscode.workspace.createFileSystemWatcher(projectFilePath);
    this._externalFileWatcher = watcher;

    const handlerImpl = async (): Promise<void> => {
      if (!this.acquireSyncLock()) return;
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

        Decompiler.decompileProject(projectFilePath, hiddenFolderDir, knownSharedModules);

        let dependencies: Record<string, unknown> = {};
        const configJsonPath = path.join(hiddenFolderDir, PROJECT_CONFIG_FILENAME);
        if (fs.existsSync(configJsonPath)) {
          try {
            const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
            if (parsed && typeof parsed === "object" && "dependencies" in parsed) {
              const deps = (parsed as { dependencies?: unknown }).dependencies;
              if (deps && typeof deps === "object") {
                dependencies = deps as Record<string, unknown>;
              }
            }
          } catch (err) {
            logger.warn(
              `Falha ao ler data7.json após decompose: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (repoBasPath && fs.existsSync(repoBasPath)) {
          DependencyScanner.syncDependencies(
            path.join(hiddenFolderDir, "src"),
            path.join(hiddenFolderDir, "data7_modules"),
            repoBasPath,
            dependencies as Record<string, string>,
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
        this.releaseSyncLock();
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
   * Starts the bidirectional workspace watcher. Reads the `enableAutoSync`
   * setting and respects it on initial setup.
   */
  public static startAutoSync(context: vscode.ExtensionContext): void {
    const { enableAutoSync } = readConfiguration();
    if (!enableAutoSync) return;

    const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.bas");
    const jsonWatcher = vscode.workspace.createFileSystemWatcher("**/data7.json");

    const handleFileChangeImpl = async (uri: vscode.Uri): Promise<void> => {
      const paths = ProjectService.findProjectPaths(uri.fsPath);
      if (!paths) return;

      const repoBasPath = RepositoryService.getRepoBasPath();
      if (!repoBasPath || !fs.existsSync(repoBasPath)) return;

      if (!this.acquireSyncLock()) return;
      try {
        await DependencyService.detectAndSyncProjectDependencies(paths.workspaceDir);
        Builder.buildProject(paths.workspaceDir, paths.projectFilePath);
        await WorkspaceSymbolIndexer.getInstance().indexWorkspace(
          vscode.workspace.workspaceFolders,
        );
        logger.info(
          `Projeto '${path.basename(paths.projectFilePath)}' auto-recompilado com sucesso.`,
        );
      } catch (err: unknown) {
        logger.error("Falha na recompilação automática.", err);
      } finally {
        this.releaseSyncLock();
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
