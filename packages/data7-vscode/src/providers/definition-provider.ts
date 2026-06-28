import * as vscode from "vscode";
import { D7AstContext, TimeTracker, WorkspaceSymbolIndexer } from "@data7/core";
import type { SymbolInfo } from "@data7/core";

export class D7BasicDefinitionProvider implements vscode.DefinitionProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    if (token.isCancellationRequested) return undefined;
    const tracker = new TimeTracker(
      `Definition no arquivo ${vscode.workspace.asRelativePath(document.uri)}`,
    );

    try {
      const result = this.provideDefinitionInternal(document, position, token);
      tracker.stopAndLog();
      return result;
    } catch (err) {
      tracker.stopAndLog();
      throw err;
    }
  }

  private provideDefinitionInternal(
    document: vscode.TextDocument,
    position: vscode.Position,
    _: vscode.CancellationToken,
  ): vscode.Definition | vscode.LocationLink[] | undefined {
    const ast = new D7AstContext(document, position, this.indexer);
    const word = ast.word;
    if (!word || !ast.wordRange) return undefined;

    let targetSymbol: SymbolInfo | undefined = ast.getMemberAccessContext()?.symbol;
    targetSymbol ??= this.indexer.findSymbolByName(word, document.uri.toString());

    if (!targetSymbol) {
      const constraint = ast.getGenericParametersInScope().get(word.toLowerCase());
      if (constraint) {
        targetSymbol = this.indexer.findSymbolByName(constraint, document.uri.toString());
      }
    }

    if (targetSymbol?.fileUri && !targetSymbol.fileUri.startsWith("system://")) {
      const targetUri = vscode.Uri.parse(targetSymbol.fileUri);
      const targetRange = new vscode.Range(
        targetSymbol.range.startLine,
        targetSymbol.range.startChar,
        targetSymbol.range.startLine,
        targetSymbol.range.endChar || 100,
      );
      return new vscode.Location(targetUri, targetRange);
    }

    return undefined;
  }
}
