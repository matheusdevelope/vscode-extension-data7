import * as path from "path";
import * as vscode from "vscode";

import {
  WorkspaceSymbolIndexer,
  LanguageProcessor,
  CONFIG_NAMESPACE,
  LANGUAGE_IDS,
  readConfiguration,
  isReadOnlyModuleFile,
  initLogger,
  logger
} from "@data7/core";
import { registerCommands } from "./commands";
import { registerLanguageProviders } from "./providers/registration";
import { ModulesSidebarProvider } from "./providers/modules-sidebar-provider";
import { QuickActionsProvider } from "./providers/quick-actions-provider";

import { ActivationService } from "./services/activation-service";
import { DiagnosticService } from "./services/diagnostic-service";
import { MCPService } from "./services/mcp-service";
import { RepositoryService } from "./services/repository-service";
import { PreviewService } from "./services/preview-service";
import { WorkspaceFixService } from "./services/workspace-fix-service";
import { DependencyService } from "./services/dependency-service";
import { ProjectService } from "./services/project-service";

export function activate(context: vscode.ExtensionContext): void {
  // Load .env configurations
  const { loadDotEnv } = require("@data7/core");
  loadDotEnv(context.extensionUri.fsPath);
  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      loadDotEnv(folder.uri.fsPath);
    }
  }

  initLogger(context);
  RepositoryService.initialize(context);
  logger.info("Extensão Data7 Dev Studio ativada.");

  DiagnosticService.initialize(context);
  registerWorkspaceListeners(context);
  registerCommands(context);
  registerLanguageProviders(context);

  const quickActionsProvider = new QuickActionsProvider();
  vscode.window.registerTreeDataProvider("data7.quickActionsView", quickActionsProvider);

  const modulesSidebarProvider = new ModulesSidebarProvider(context);
  vscode.window.registerTreeDataProvider("data7.modulesView", modulesSidebarProvider);
  vscode.commands.registerCommand("data7.modules.refreshView", () => {
    modulesSidebarProvider.refresh();
  });

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
  indexer
    .indexWorkspace(vscode.workspace.workspaceFolders)
    .then(() => {
      const diagnosticsFeatures = readConfiguration().features.diagnostics;
      if (!diagnosticsFeatures.enabled) return;
      if (diagnosticsFeatures.lintWorkspaceOnStartup) {
        void DiagnosticService.lintWorkspace(false);
        return;
      }
      DiagnosticService.refreshOpenDocuments();
      DiagnosticService.pruneClosedDiagnostics();
    })
    .catch((err) => {
      logger.error("Erro ao indexar workspace.", err);
    });

  const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.bas");
  const isReadOnlyOrModule = (fsPath: string): boolean => {
    const lower = fsPath.toLowerCase();
    return lower.includes("data7_modules") || isReadOnlyModuleFile(fsPath);
  };

  basWatcher.onDidChange((uri) => {
    if (isReadOnlyOrModule(uri.fsPath)) return;
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  basWatcher.onDidCreate((uri) => {
    if (isReadOnlyOrModule(uri.fsPath)) return;
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  basWatcher.onDidDelete((uri) => {
    if (isReadOnlyOrModule(uri.fsPath)) return;
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.removeFile(uri.toString());
    DiagnosticService.clearDiagnostics(uri);
    scheduleDependencyRefreshForFile(uri.fsPath);
  });
  context.subscriptions.push(basWatcher);

  // Listen to document changes to update AST cache reactively
  const docChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId === LANGUAGE_IDS.d7basic || e.document.fileName.endsWith(".bas")) {
      LanguageProcessor.getInstance().handleDocumentChange(
        e.document.uri.toString(),
        e.document.getText(),
        e.document.version,
      );
    }
  });

  const docCloseListener = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (doc.languageId === LANGUAGE_IDS.d7basic || doc.fileName.endsWith(".bas")) {
      LanguageProcessor.getInstance().invalidate(doc.uri.toString());
      DiagnosticService.clearDiagnostics(doc.uri);
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
    for (const file of e.files) {
      const oldPath = path.normalize(file.oldUri.fsPath).toLowerCase();
      const newPath = path.normalize(file.newUri.fsPath).toLowerCase();
      indexer.renameWorkspaceFolder(oldPath, newPath);
      scheduleDependencyRefreshForFile(file.oldUri.fsPath);
      scheduleDependencyRefreshForFile(file.newUri.fsPath);
    }
  });

  const deleteListener = vscode.workspace.onDidDeleteFiles((e) => {
    for (const uri of e.files) {
      const deletedPath = path.normalize(uri.fsPath).toLowerCase();
      indexer.deleteWorkspaceFolder(deletedPath);
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
    const cfg = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    const saveFeatures = readConfiguration().features.save;
    const formatOnSave = saveFeatures.autoFormatOnSave || cfg.get<boolean>("autoFormatOnSave");
    if (!saveFeatures.autoFixOnSave && !formatOnSave) return;
    e.waitUntil(
      Promise.resolve().then(async () => {
        if (saveFeatures.autoFixOnSave) {
          const fixEdits = WorkspaceFixService.buildWillSaveTextEdits(e.document);
          if (fixEdits && fixEdits.length > 0) {
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
