import {
  createNodeFs,
  type AnalysisHost,
  type AnalysisHostDocument,
  type AnalysisLogLevel,
  type AnalysisWorkspaceFolder,
} from "@data7/core";
import type { TextDocuments } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

export interface LspHostConnection {
  console: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
}

export interface LspAnalysisHostOptions {
  readonly documents: TextDocuments<TextDocument>;
  readonly connection: LspHostConnection;
  readonly getWorkspaceFolders: () => readonly AnalysisWorkspaceFolder[] | undefined;
}

/**
 * {@link AnalysisHost} backed by the LSP document manager and Node filesystem.
 * Exposes `notifyConfigurationChanged` so the server can fan out
 * `workspace/didChangeConfiguration` to analysis listeners.
 */
export function createLspAnalysisHost(
  options: LspAnalysisHostOptions,
): AnalysisHost & { notifyConfigurationChanged(section: string): void } {
  const configListeners = new Set<(section: string) => void>();
  const hostFs = createNodeFs();

  return {
    getOpenDocument(uri: string): AnalysisHostDocument | undefined {
      const doc = options.documents.get(uri);
      if (doc) {
        return {
          uri: doc.uri,
          version: doc.version,
          getText: () => doc.getText(),
        };
      }
      // TextDocuments is case-sensitive; try a linear scan for Windows casing.
      const key = uri.toLowerCase();
      for (const open of options.documents.all()) {
        if (open.uri.toLowerCase() === key) {
          return {
            uri: open.uri,
            version: open.version,
            getText: () => open.getText(),
          };
        }
      }
      return undefined;
    },
    getWorkspaceFolders(): readonly AnalysisWorkspaceFolder[] | undefined {
      return options.getWorkspaceFolders();
    },
    fs: hostFs,
    log(level: AnalysisLogLevel, message: string, err?: unknown): void {
      const detail =
        err === undefined
          ? message
          : `${message}\n${err instanceof Error ? (err.stack ?? err.message) : String(err)}`;
      if (level === "error") options.connection.console.error(detail);
      else if (level === "warn") options.connection.console.warn(detail);
      else options.connection.console.info(detail);
    },
    onDidChangeConfiguration(listener) {
      configListeners.add(listener);
      return {
        dispose: () => {
          configListeners.delete(listener);
        },
      };
    },
    notifyConfigurationChanged(section: string): void {
      for (const listener of configListeners) {
        listener(section);
      }
    },
  };
}
