import * as path from "path";
import * as vscode from "vscode";

import {
  WorkspaceSymbolIndexer,
  LanguageProcessor,
  AnalysisProgram,
  COMMAND_IDS,
  LANGUAGE_IDS,
  readConfiguration,
  debounceKeyed,
  isBasicSourcePath,
  isReadOnlyModuleFile,
  installVscodeApi,
  initLogger,
  logger,
} from "@data7/core";
import { registerCommands } from "./commands";
import { registerLanguageProviders } from "./providers/registration";
import { ModuleTreeItem, ModulesSidebarProvider } from "./providers/modules-sidebar-provider";
import { QuickActionsProvider } from "./providers/quick-actions-provider";

import { ActivationService } from "./services/activation-service";
import { DiagnosticService } from "./services/diagnostic-service";
import { ExtensionSettingsService } from "./services/extension-settings-service";
import { registerExtensionSettingsEditor } from "./services/extension-settings-editor";
import { MCPService } from "./services/mcp-service";
import { RepositoryService } from "./services/repository-service";
import { PreviewService } from "./services/preview-service";
import { WorkspaceFixService } from "./services/workspace-fix-service";
import { DependencyService } from "./services/dependency-service";
import { ProjectService } from "./services/project-service";

export function activate(context: vscode.ExtensionContext): void {
  installVscodeApi(vscode as unknown as Parameters<typeof installVscodeApi>[0]);

  // Load .env configurations
  const { loadDotEnv } = require("@data7/core");
  loadDotEnv(context.extensionUri.fsPath);
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      loadDotEnv(folder.uri.fsPath);
    }
  }

  initLogger(context);
  ExtensionSettingsService.initialize(context);
  registerExtensionSettingsEditor(context);
  RepositoryService.initialize(context);
  logger.info("Extensão Data7 Dev Studio ativada.");

  DiagnosticService.initialize(context);
  registerWorkspaceListeners(context);
  registerCommands(context);
  registerLanguageProviders(context);

  const quickActionsProvider = new QuickActionsProvider();
  vscode.window.registerTreeDataProvider("data7.quickActionsView", quickActionsProvider);

  const modulesSidebarProvider = new ModulesSidebarProvider(context);
  const modulesTreeView = vscode.window.createTreeView("data7.modulesView", {
    treeDataProvider: modulesSidebarProvider,
    showCollapseAll: true,
  });
  modulesTreeView.onDidChangeCheckboxState((event) => {
    modulesSidebarProvider.setCheckboxStates(event.items);
  });
  context.subscriptions.push(modulesTreeView);
  context.subscriptions.push(
    vscode.commands.registerCommand("data7.modules.refreshView", () => {
      modulesSidebarProvider.refresh();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.installSelectedModules, async (item?: unknown) => {
      const names = modulesSidebarProvider.getSelectedOrItemModuleNames(
        item instanceof ModuleTreeItem ? item : undefined,
      );
      if (names.length === 0) {
        vscode.window.showWarningMessage("Marque um ou mais módulos para instalar.");
        return;
      }
      await DependencyService.installModules(names);
      modulesSidebarProvider.refresh();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.updateSelectedModules, async (item?: unknown) => {
      const names = modulesSidebarProvider.getSelectedOrItemModuleNames(
        item instanceof ModuleTreeItem ? item : undefined,
      );
      if (names.length === 0) {
        await DependencyService.updateDependencies();
      } else {
        await DependencyService.updateModules(names);
      }
      modulesSidebarProvider.refresh();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.removeSelectedModules, async (item?: unknown) => {
      const names = modulesSidebarProvider.getSelectedOrItemModuleNames(
        item instanceof ModuleTreeItem ? item : undefined,
      );
      if (names.length === 0) {
        vscode.window.showWarningMessage("Marque um ou mais módulos instalados para remover.");
        return;
      }
      await DependencyService.removeModules(names);
      modulesSidebarProvider.refresh();
    }),
  );

  ActivationService.initializeWorkspace(context);
  const features = readConfiguration().features;
  if (features.preview.enabled) {
    PreviewService.initialize(context);
  }

  // Auto-install (idempotente) o binário MCP em globalStorage para que
  // clientes externos (Cursor / Claude Desktop / Continue) possam
  // apontar para um caminho estável. A operação compara hashes e
  // ignora se já está em dia, então o custo em ativações subsequentes
  // é apenas uma leitura de arquivo.
  if (features.workspace.installMcpServerOnStartup) {
    void MCPService.installMcpServer(context).catch((err: unknown) => {
      logger.error("MCP: falha na auto-instalação durante activate.", err);
    });
  }

  // Auto-detect .7Proj files in the workspace and offer to open one.
  if (features.workspace.detectProjectFiles) {
    setTimeout(() => {
      void ActivationService.detectAndPromptProjFiles();
    }, 1500);
  }
}

// -----------------------------------------------------------------------------
// Workspace listeners
//
// Lives here (rather than in services/) because it wires together workspace
// listeners with the indexer and diagnostics service — it is activation glue,
// not a long-lived service with its own lifecycle.
// -----------------------------------------------------------------------------

function registerWorkspaceListeners(context: vscode.ExtensionContext): void {
  const indexer = WorkspaceSymbolIndexer.getInstance();
  void vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: "Data7: indexando workspace…",
    },
    async () => {
      try {
        await indexer.indexWorkspace(vscode.workspace.workspaceFolders);
      } catch (err) {
        // A partial index still serves the editor better than a dead linter:
        // `markWorkspaceIndexReady` below runs regardless so queued documents
        // are never stranded (see REFACTOR-ANALYSIS-ENGINE.md §2.3).
        logger.error("Erro ao indexar workspace. A análise seguirá com índice parcial.", err);
      } finally {
        DiagnosticService.markWorkspaceIndexReady();
      }

      const diagnosticsFeatures = readConfiguration().features.diagnostics;
      if (!diagnosticsFeatures.enabled) return;
      if (diagnosticsFeatures.lintWorkspaceOnStartup) {
        void DiagnosticService.lintWorkspace(false);
        return;
      }
      DiagnosticService.refreshOpenDocuments();
      DiagnosticService.pruneClosedDiagnostics();
    },
  );

  // `.d7b` is a first-class alias of `.bas`; watching only `.bas` left those
  // files stale in the index until a full re-index.
  const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.{bas,d7b}");
  const isReadOnlyOrModule = (fsPath: string): boolean => {
    const lower = fsPath.toLowerCase();
    return lower.includes("data7_modules") || isReadOnlyModuleFile(fsPath);
  };

  basWatcher.onDidChange((uri) => {
    if (isReadOnlyOrModule(uri.fsPath)) return;
    const openDoc = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
    );
    if (openDoc?.isDirty) return;
    // The user saving their own buffer fires this watcher too. Re-reading and
    // re-parsing a file we already hold verbatim was pure latency on every save.
    if (
      openDoc &&
      AnalysisProgram.getInstance().matchesContent(uri.toString(), openDoc.getText())
    ) {
      scheduleDependencyRefreshForFile(uri.fsPath);
      return;
    }
    AnalysisProgram.getInstance().closeDocument(uri.toString());
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
    DiagnosticService.scheduleExternalFileRefresh(uri);
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  basWatcher.onDidCreate((uri) => {
    DiagnosticService.invalidateWorkspaceFileList();
    if (isReadOnlyOrModule(uri.fsPath)) return;
    AnalysisProgram.getInstance().closeDocument(uri.toString());
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
    DiagnosticService.scheduleExternalFileRefresh(uri);
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  basWatcher.onDidDelete((uri) => {
    DiagnosticService.invalidateWorkspaceFileList();
    if (isReadOnlyOrModule(uri.fsPath)) return;
    AnalysisProgram.getInstance().deleteFile(uri.toString());
    LanguageProcessor.getInstance().invalidate(uri.toString());
    DiagnosticService.clearDiagnostics(uri);
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  context.subscriptions.push(basWatcher);

  /**
   * Parse + symbol walk + index update used to run synchronously on every
   * keystroke. It is now coalesced over a short window: providers stay correct
   * because `ensureParsed` re-parses on demand whenever the buffer version does
   * not match the snapshot (REFACTOR-ANALYSIS-ENGINE.md §4.2).
   */
  const scheduleProgramUpdate = debounceKeyed(
    (doc: vscode.TextDocument) => {
      AnalysisProgram.getInstance().update(doc.uri.toString(), doc.getText(), doc.version);
    },
    50,
    (doc: vscode.TextDocument) => doc.uri.toString().toLowerCase(),
  );

  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === LANGUAGE_IDS.d7basic || isBasicSourcePath(e.document.fileName)) {
      scheduleProgramUpdate(e.document);
    }
  });

  const docCloseListener = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (doc.languageId === LANGUAGE_IDS.d7basic || isBasicSourcePath(doc.fileName)) {
      // A pending update would resurrect the snapshot we are about to drop.
      scheduleProgramUpdate.cancel(doc.uri.toString().toLowerCase());
      // Closing a tab frees the snapshot but never unindexes: the file is still
      // part of the workspace and other files must keep resolving against it.
      AnalysisProgram.getInstance().closeDocument(doc.uri.toString());
      LanguageProcessor.getInstance().invalidate(doc.uri.toString());
      // Workspace-file diagnostics are preserved by DiagnosticService.onDidCloseTextDocument.
      if (!vscode.workspace.getWorkspaceFolder(doc.uri)) {
        DiagnosticService.clearDiagnostics(doc.uri);
      }
    }
  });
  context.subscriptions.push(docChangeListener, docCloseListener);

  const docSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.languageId === LANGUAGE_IDS.d7basic || doc.fileName.endsWith(".bas")) {
      scheduleDependencyRefreshForFile(doc.fileName);
    }
  });
  context.subscriptions.push(docSaveListener);

  const renameListener = vscode.workspace.onDidRenameFiles((e) => {
    DiagnosticService.invalidateWorkspaceFileList();
    for (const file of e.files) {
      // Single transition: the old identity is dropped and the new one indexed
      // before anything else observes the program.
      AnalysisProgram.getInstance().renameFile(file.oldUri.toString(), file.newUri.toString());
      DiagnosticService.clearDiagnostics(file.oldUri);
      if (isBasicSourcePath(file.newUri.fsPath)) {
        DiagnosticService.scheduleExternalFileRefresh(file.newUri);
      }
      scheduleDependencyRefreshForFile(file.oldUri.fsPath);
      scheduleDependencyRefreshForFile(file.newUri.fsPath);
    }
  });

  const deleteListener = vscode.workspace.onDidDeleteFiles((e) => {
    DiagnosticService.invalidateWorkspaceFileList();
    for (const uri of e.files) {
      const deletedPath = path.normalize(uri.fsPath).toLowerCase();
      // Folder deletions arrive as a single event; drop every file underneath.
      indexer.deleteWorkspaceFolder(deletedPath);
      AnalysisProgram.getInstance().deleteFile(uri.toString());
      LanguageProcessor.getInstance().invalidate(uri.toString());
      DiagnosticService.clearDiagnostics(uri);
      scheduleDependencyRefreshForFile(uri.fsPath);
    }
  });

  context.subscriptions.push(renameListener, deleteListener);

  if (readConfiguration().features.workspace.detectProjectFiles) {
    // Offer to open a .7Proj when one is opened or viewed in the editor.
    const openProjListener = vscode.workspace.onDidOpenTextDocument((doc) => {
      void ActivationService.handleProjectDocumentOpen(doc);
    });
    const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        void ActivationService.handleProjectDocumentOpen(editor.document);
      }
    });
    context.subscriptions.push(openProjListener, activeEditorListener);

    vscode.workspace.textDocuments.forEach((doc) => {
      void ActivationService.handleProjectDocumentOpen(doc);
    });
    if (vscode.window.activeTextEditor) {
      void ActivationService.handleProjectDocumentOpen(vscode.window.activeTextEditor.document);
    }
  }

  // Apply optional syntax/style automation on save. The legacy format flag is
  // retained as a compatibility fallback for existing workspaces.
  const formatOnSaveListener = vscode.workspace.onWillSaveTextDocument((e) => {
    if (e.document.languageId !== LANGUAGE_IDS.d7basic && !e.document.fileName.endsWith(".bas")) {
      return;
    }
    const saveFeatures = readConfiguration().features.save;
    const formatOnSave = saveFeatures.autoFormatOnSave;
    if (!saveFeatures.autoFixOnSave && !formatOnSave) return;
    e.waitUntil(
      Promise.resolve().then(async () => {
        if (saveFeatures.autoFixOnSave) {
          const fixEdits = WorkspaceFixService.buildWillSaveTextEdits(e.document);
          if (fixEdits && fixEdits.length > 0) {
            // The willSave edits land as the next revision of the buffer.
            DiagnosticService.suppressLiveLintThroughVersion(
              e.document.uri,
              e.document.version + 1,
            );
            return fixEdits;
          }
        }
        if (!formatOnSave) {
          return [];
        }
        const formatEdits = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
          "vscode.executeFormatDocumentProvider",
          e.document.uri,
        );
        return formatEdits ?? [];
      }),
    );
  });
  context.subscriptions.push(formatOnSaveListener);
}

function scheduleDependencyRefreshForFile(filePath: string): void {
  if (!filePath.toLowerCase().endsWith(".bas")) return;
  const project = ProjectService.findProjectPaths(filePath);
  if (!project) return;
  DependencyService.scheduleWorkspaceDependencyRefresh(project.workspaceDir);
}
