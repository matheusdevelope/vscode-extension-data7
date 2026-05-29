import * as path from "path";
import * as vscode from "vscode";

import { WorkspaceSymbolIndexer } from "./analysis/symbol-indexer";
import { CONFIG_NAMESPACE, LANGUAGE_IDS } from "./infra/constants";
import { initLogger, logger } from "./infra/logger";
import { Builder } from "./project/builder";
import { registerCommands } from "./commands";
import { registerLanguageProviders } from "./providers/registration";

import { ActivationService } from "./services/activation-service";
import { DependencyService } from "./services/dependency-service";
import { DiagnosticService } from "./services/diagnostic-service";
import { MCPService } from "./services/mcp-service";
import { ProjectService } from "./services/project-service";
import { RepositoryService } from "./services/repository-service";
import { SyncWatcher } from "./services/sync-watcher";
import { PreviewService } from "./services/preview-service";

import { debounce } from "./utils/debounce";

export function activate(context: vscode.ExtensionContext): void {
  initLogger(context);
  RepositoryService.initialize(context);
  logger.info("Extensão Data7 Dev Studio ativada.");

  registerWorkspaceListeners(context);
  registerCommands(context);
  registerLanguageProviders(context);

  DiagnosticService.initialize(context);
  ActivationService.initializeWorkspace(context);
  SyncWatcher.startAutoSync(context);
  PreviewService.initialize(context);

  // Auto-install (idempotente) o binário MCP em globalStorage para que
  // clientes externos (Cursor / Claude Desktop / Continue) possam
  // apontar para um caminho estável. A operação compara hashes e
  // ignora se já está em dia, então o custo em ativações subsequentes
  // é apenas uma leitura de arquivo.
  void MCPService.installMcpServer(context).catch((err: unknown) => {
    logger.error("MCP: falha na auto-instalação durante activate.", err);
  });

  // Auto-detect .7Proj files in the workspace and offer to open one.
  setTimeout(() => {
    void ActivationService.detectAndPromptProjFiles();
  }, 1500);
}

export function deactivate(): void {
  SyncWatcher.dispose();
  logger.info("Extensão Data7 Dev Studio desativada.");
}

// -----------------------------------------------------------------------------
// Workspace listeners
//
// Lives here (rather than in services/) because it wires together listeners
// from indexer, dependency service, project service, and the builder — it is
// activation glue, not a long-lived service with its own lifecycle.
// -----------------------------------------------------------------------------

function registerWorkspaceListeners(context: vscode.ExtensionContext): void {
  const indexer = WorkspaceSymbolIndexer.getInstance();
  indexer
    .indexWorkspace(vscode.workspace.workspaceFolders)
    .then(() => {
      // Quando o cache "esquentar", forçamos o linter a reavaliar os arquivos
      // que já estavam abertos na tela, revelando os erros que passaram batidos.
      DiagnosticService.refreshAllActive();
    })
    .catch((err) => {
      logger.error("Erro ao indexar workspace.", err);
    });

  const basWatcher = vscode.workspace.createFileSystemWatcher("**/*.bas");
  basWatcher.onDidChange((uri) => {
    indexer.indexFile(uri.toString());
  });
  basWatcher.onDidCreate((uri) => {
    indexer.indexFile(uri.toString());
  });
  basWatcher.onDidDelete((uri) => {
    indexer.removeFile(uri.toString());
  });
  context.subscriptions.push(basWatcher);

  // Auto-rebuild on rename / delete inside a project. Debounced to absorb bursts.
  const handleProjectChange = debounce((workspaceDir: string, projectFilePath: string) => {
    void (async () => {
      try {
        await DependencyService.detectAndSyncProjectDependencies(workspaceDir);
        Builder.buildProject(workspaceDir, projectFilePath);
      } catch (err: unknown) {
        logger.error(`Erro ao reconstruir projeto em ${workspaceDir}.`, err);
      }
    })();
  }, 400);

  const renameListener = vscode.workspace.onDidRenameFiles((e) => {
    for (const file of e.files) {
      const oldPath = path.normalize(file.oldUri.fsPath).toLowerCase();
      const newPath = path.normalize(file.newUri.fsPath).toLowerCase();
      indexer.renameWorkspaceFolder(oldPath, newPath);
      const paths = ProjectService.findProjectPaths(file.newUri.fsPath);
      if (paths) handleProjectChange(paths.workspaceDir, paths.projectFilePath);
    }
  });

  const deleteListener = vscode.workspace.onDidDeleteFiles((e) => {
    for (const uri of e.files) {
      const deletedPath = path.normalize(uri.fsPath).toLowerCase();
      indexer.deleteWorkspaceFolder(deletedPath);
      const paths = ProjectService.findProjectPaths(uri.fsPath);
      if (paths) handleProjectChange(paths.workspaceDir, paths.projectFilePath);
    }
  });

  context.subscriptions.push(renameListener, deleteListener);

  // Offer to open a .7Proj when one is opened in the editor.
  const openProjListener = vscode.workspace.onDidOpenTextDocument((doc) => {
    void ActivationService.handleProjectDocumentOpen(doc);
  });
  context.subscriptions.push(openProjListener);
  vscode.workspace.textDocuments.forEach((doc) => {
    void ActivationService.handleProjectDocumentOpen(doc);
  });

  // Optional: format `.bas` files on save when the user opts in via `data7.autoFormatOnSave`.
  const formatOnSaveListener = vscode.workspace.onWillSaveTextDocument((e) => {
    if (e.document.languageId !== LANGUAGE_IDS.d7basic) return;
    const cfg = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    if (!cfg.get<boolean>("autoFormatOnSave")) return;
    e.waitUntil(
      vscode.commands
        .executeCommand<vscode.TextEdit[]>("vscode.executeFormatDocumentProvider", e.document.uri)
        .then((edits: vscode.TextEdit[] | undefined) => edits ?? []),
    );
  });
  context.subscriptions.push(formatOnSaveListener);
}
