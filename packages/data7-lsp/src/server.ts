/**
 * Data7 Language Server entry point (LSP-001).
 *
 * Runs outside the extension host as a stdio child. Environment access goes
 * through {@link createLspAnalysisHost}; language semantics come from
 * `@data7/core` only.
 */
import {
  AnalysisProgram,
  DEFAULT_EXTENSION_SETTINGS,
  WorkspaceSymbolIndexer,
  installAnalysisHost,
  installExtensionSettingsProvider,
  normalizeExtensionSettings,
  workspaceFolderFromPath,
  type AnalysisWorkspaceFolder,
  type Data7Configuration,
  Uri,
} from "@data7/core";
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  type InitializeParams,
  type InitializeResult,
  TextDocumentSyncKind,
  type WorkspaceFolder,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createLspAnalysisHost } from "./host";
import { clearDocumentDiagnostics, publishDocumentDiagnostics } from "./diagnostics/publisher";
import { syncDocumentClose, syncDocumentOpenOrChange } from "./documents";
import { applyWatchedFileEvents } from "./handlers/watched-files";
import type { Data7LspInitializeOptions } from "./settings";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let workspaceFolders: AnalysisWorkspaceFolder[] | undefined;
let activeSettings: Data7Configuration = DEFAULT_EXTENSION_SETTINGS;

const host = createLspAnalysisHost({
  documents,
  connection,
  getWorkspaceFolders: () => workspaceFolders,
});

function applySettings(settings: Data7Configuration | undefined): void {
  activeSettings = normalizeExtensionSettings(settings ?? DEFAULT_EXTENSION_SETTINGS);
  installExtensionSettingsProvider(() => activeSettings);
  host.notifyConfigurationChanged("data7");
}

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const options = (params.initializationOptions ?? {}) as Data7LspInitializeOptions;
  applySettings(options.settings);

  workspaceFolders = (params.workspaceFolders ?? []).map((folder, index) =>
    toAnalysisFolder(folder, index),
  );

  installAnalysisHost(host);
  // Fresh process: the singleton binds to the LSP host installed above.
  void AnalysisProgram.getInstance();

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      workspace: {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      },
      // Providers migrate in Fase 4; push diagnostics ship in this phase.
    },
  };
  return result;
});

connection.onInitialized(() => {
  void indexWorkspaceFolders();
  connection.console.info("[data7-lsp] initialized");
});

connection.onDidChangeConfiguration((change) => {
  const settings = (change.settings as { data7?: Data7Configuration } | undefined)?.data7;
  if (settings) {
    applySettings(settings);
  } else {
    host.notifyConfigurationChanged("data7");
  }
  // Re-lint every open buffer after settings change.
  for (const doc of documents.all()) {
    publishDocumentDiagnostics(connection, doc);
  }
});

connection.onDidChangeWatchedFiles((params) => {
  applyWatchedFileEvents(params.changes);
});

documents.onDidOpen((event) => {
  syncDocumentOpenOrChange(event.document);
  publishDocumentDiagnostics(connection, event.document);
});

documents.onDidChangeContent((event) => {
  syncDocumentOpenOrChange(event.document);
  publishDocumentDiagnostics(connection, event.document);
});

documents.onDidClose((event) => {
  syncDocumentClose(event.document.uri);
  clearDocumentDiagnostics(connection, event.document.uri);
});

documents.listen(connection);
connection.listen();

async function indexWorkspaceFolders(): Promise<void> {
  const folders = workspaceFolders;
  if (!folders || folders.length === 0) return;

  const vscodeFolders = folders.map((folder) => ({
    uri: Uri.parse(folder.uri),
    name: folder.name,
    index: folder.index,
  }));

  try {
    await WorkspaceSymbolIndexer.getInstance().indexWorkspace(vscodeFolders);
    AnalysisProgram.getInstance().invalidateAllChecks();
    connection.console.info(`[data7-lsp] indexed ${String(folders.length)} workspace folder(s)`);
    for (const doc of documents.all()) {
      publishDocumentDiagnostics(connection, doc);
    }
  } catch (err) {
    connection.console.error(
      `[data7-lsp] workspace index failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function toAnalysisFolder(folder: WorkspaceFolder, index: number): AnalysisWorkspaceFolder {
  try {
    return workspaceFolderFromPath(Uri.parse(folder.uri).fsPath, index);
  } catch {
    return { uri: folder.uri, name: folder.name, index };
  }
}
