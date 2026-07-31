import { AnalysisProgram, isBasicSourcePath } from "@data7/core";
import type { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Pushes an open/changed LSP buffer into {@link AnalysisProgram}.
 */
export function syncDocumentOpenOrChange(doc: TextDocument): void {
  if (!isBasicSourceUri(doc.uri)) return;
  AnalysisProgram.getInstance().update(doc.uri, doc.getText(), doc.version);
}

/**
 * Closes a buffer in memory but keeps the file indexed (editor tab closed).
 */
export function syncDocumentClose(uri: string): void {
  if (!isBasicSourceUri(uri)) return;
  AnalysisProgram.getInstance().closeDocument(uri);
}

/**
 * Removes a file from the analysis index (disk delete / rename away).
 */
export function syncDocumentDelete(uri: string): void {
  if (!isBasicSourceUri(uri)) return;
  AnalysisProgram.getInstance().deleteFile(uri);
}

export function isBasicSourceUri(uri: string): boolean {
  try {
    // file:///.../foo.bas or untitled:foo.bas — path-based check is enough.
    const pathPart = uri.includes("://") ? (uri.split("://")[1] ?? uri) : uri;
    return isBasicSourcePath(pathPart) || isBasicSourcePath(uri);
  } catch {
    return false;
  }
}
