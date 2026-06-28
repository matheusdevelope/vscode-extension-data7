import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { resolveNamespaceFile } from "../analysis/module-resolver";

/**
 * Makes `Imports MyModule` clickable — Ctrl+click opens the file where the
 * namespace `MyModule` is declared. Resolution priority:
 *
 *  1. Workspace `.bas` containing `Namespace MyModule`.
 *  2. Repository `.bas` containing `Namespace MyModule`.
 *
 * System Library namespaces (Forms, IO, SQL, etc.) intentionally do not
 * resolve — their definitions live in TypeScript source and would not be
 * useful to most users.
 *
 * The actual namespace → filesystem lookup lives in
 * `analysis/module-resolver.ts`, so this provider stays a thin adapter over
 * the resolver and the previous documented exception to import a service is
 * no longer needed.
 */
export class D7BasicDocumentLinkProvider implements vscode.DocumentLinkProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideDocumentLinks(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    if (token.isCancellationRequested) return undefined;

    const links: vscode.DocumentLink[] = [];
    const importsRegex = /^(\s*Imports\s+)([A-Za-z_][\w.]*)/i;

    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      const m = importsRegex.exec(lineText);
      const prefix = m?.[1];
      const namespace = m?.[2];
      if (!m || !prefix || !namespace) continue;

      const target = resolveNamespaceFile(this.indexer, namespace);
      if (!target) continue;

      const startChar = prefix.length;
      const range = new vscode.Range(i, startChar, i, startChar + namespace.length);
      const link = new vscode.DocumentLink(range, vscode.Uri.file(target));
      link.tooltip = `Abrir definição do namespace ${namespace}`;
      links.push(link);
    }

    return links;
  }
}
