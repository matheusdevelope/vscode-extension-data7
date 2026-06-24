import * as path from "path";
import * as vscode from "vscode";

import { WorkspaceSymbolIndexer } from "./analysis/symbol-indexer";
import { LanguageProcessor } from "./analysis/language-processor";
import { CONFIG_NAMESPACE, LANGUAGE_IDS } from "./infra/constants";
import { readConfiguration } from "./infra/configuration";
import { initLogger, logger } from "./infra/logger";
import { registerCommands } from "./commands";
import { registerLanguageProviders } from "./providers/registration";

import { ActivationService } from "./services/activation-service";
import { DiagnosticService } from "./services/diagnostic-service";
import { MCPService } from "./services/mcp-service";
import { RepositoryService } from "./services/repository-service";
import { PreviewService } from "./services/preview-service";
import { WorkspaceFixService } from "./services/workspace-fix-service";

export function activate(context: vscode.ExtensionContext): void {
  initLogger(context);
  RepositoryService.initialize(context);
  logger.info("Extensão Data7 Dev Studio ativada.");

  registerWorkspaceListeners(context);
  registerCommands(context);
  registerLanguageProviders(context);

  DiagnosticService.initialize(context);
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
      const diagnostics = readConfiguration().features.diagnostics;
      if (!diagnostics.enabled || !diagnostics.lintWorkspaceOnStartup) return;
      // Quando o cache "esquentar", iniciamos o linter no projeto inteiro.
      void DiagnosticService.lintWorkspace(true).catch((err) => {
        logger.error("Erro ao rodar linter no workspace inicial.", err);
      });
    })
    .catch((err) => {
      logger.error("Erro ao indexar workspace.", err);
    });

  const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.bas");
  basWatcher.onDidChange((uri) => {
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
  });
  basWatcher.onDidCreate((uri) => {
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.indexFile(uri.toString());
  });
  basWatcher.onDidDelete((uri) => {
    LanguageProcessor.getInstance().invalidate(uri.toString());
    indexer.removeFile(uri.toString());
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
    }
  });
  context.subscriptions.push(docChangeListener, docCloseListener);

  const renameListener = vscode.workspace.onDidRenameFiles((e) => {
    for (const file of e.files) {
      const oldPath = path.normalize(file.oldUri.fsPath).toLowerCase();
      const newPath = path.normalize(file.newUri.fsPath).toLowerCase();
      indexer.renameWorkspaceFolder(oldPath, newPath);
    }
  });

  const deleteListener = vscode.workspace.onDidDeleteFiles((e) => {
    for (const uri of e.files) {
      const deletedPath = path.normalize(uri.fsPath).toLowerCase();
      indexer.deleteWorkspaceFolder(deletedPath);
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
