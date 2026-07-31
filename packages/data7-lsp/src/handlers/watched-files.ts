import { AnalysisProgram, isBasicSourcePath, Uri } from "@data7/core";
import type { FileEvent } from "vscode-languageserver/node";
import { FileChangeType } from "vscode-languageserver/node";
import { syncDocumentDelete } from "../documents";

/**
 * Applies `workspace/didChangeWatchedFiles` events to the analysis program.
 * Open buffers are owned by TextDocuments sync; this path covers disk-only
 * create/change/delete for closed files.
 */
export function applyWatchedFileEvents(events: readonly FileEvent[]): void {
  const program = AnalysisProgram.getInstance();
  for (const event of events) {
    if (!isBasicSourcePath(event.uri) && !uriLooksBasic(event.uri)) {
      continue;
    }
    switch (event.type) {
      case FileChangeType.Deleted:
        syncDocumentDelete(event.uri);
        break;
      case FileChangeType.Created:
      case FileChangeType.Changed:
        // Closed-file disk edits: re-index from host.fs. Open docs are refreshed
        // via textDocument/didChange instead.
        try {
          const fsPath = Uri.parse(event.uri).fsPath;
          const host = program.getHost();
          if (host.fs.existsSync(fsPath)) {
            const content = host.fs.readFileSync(fsPath);
            program.update(event.uri, content, Date.now());
          }
        } catch {
          /* ignore unreadable paths */
        }
        break;
      default:
        break;
    }
  }
}

function uriLooksBasic(uri: string): boolean {
  const lower = uri.toLowerCase();
  return lower.endsWith(".bas") || lower.endsWith(".d7b");
}
