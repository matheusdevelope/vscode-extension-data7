import * as vscode from "vscode";
import { WorkspaceSymbolIndexer, mapSystemKindToVsCode } from "@data7/core";
import type { SymbolInfo } from "@data7/core";

/**
 * Provides workspace-wide symbol search for `Ctrl+T` ("Go to Symbol in Workspace…").
 *
 * Matching strategy: a case-insensitive substring match against the symbol name
 * AND against `containerName.name` so users can type "Form.Show" to narrow.
 */
export class D7BasicWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  private static readonly MAX_RESULTS = 500;

  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SymbolInformation[]> {
    if (token.isCancellationRequested) return undefined;

    const q = query.trim().toLowerCase();
    const allSymbols = this.indexer.getAllSymbols();

    // Empty query: VS Code asks for "everything"; we return a useful first page
    // of top-level declarations (namespaces, classes, top-level methods).
    const matched: SymbolInfo[] = [];
    for (const s of allSymbols) {
      if (matched.length >= D7BasicWorkspaceSymbolProvider.MAX_RESULTS) break;
      // Token can flip asynchronously during iteration.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (token.isCancellationRequested) return undefined;

      if (q === "") {
        if (s.kind === "namespace" || s.kind === "class" || s.kind === "structure") {
          matched.push(s);
        }
        continue;
      }
      const hay = `${s.containerName ?? ""}.${s.name}`.toLowerCase();
      if (hay.includes(q)) matched.push(s);
    }

    return matched.map((s) => toSymbolInformation(s));
  }
}

function toSymbolInformation(s: SymbolInfo): vscode.SymbolInformation {
  const uri = vscode.Uri.parse(s.fileUri);
  const range = new vscode.Range(
    s.range.startLine,
    s.range.startChar,
    s.range.endLine,
    s.range.endChar,
  );
  const location = new vscode.Location(uri, range);
  return new vscode.SymbolInformation(
    s.name,
    mapSystemKindToVsCode(s),
    s.containerName ?? "",
    location,
  );
}
