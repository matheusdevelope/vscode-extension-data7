import * as vscode from "vscode";
import { resolveSourceMapContext } from "./source-map-provider-context";

/**
 * Go to Definition inside a built `.7Proj`: jumps to the original `.bas`
 * line recorded in `<project>.7Proj.map.json`.
 */
export class D7ProjectSourceMapDefinitionProvider implements vscode.DefinitionProvider {
  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    if (token.isCancellationRequested) return undefined;

    const context = resolveSourceMapContext(document, position);
    if (!context || token.isCancellationRequested) return undefined;

    const targetUri = vscode.Uri.parse(context.original.fileUri);
    const targetLine = Math.max(0, context.original.line);
    const targetCol = Math.max(0, context.original.column);
    const targetRange = new vscode.Range(targetLine, targetCol, targetLine, targetCol);

    const originLine = document.lineAt(position.line);
    const originSelectionRange = new vscode.Range(
      position.line,
      0,
      position.line,
      originLine.text.length,
    );

    const link: vscode.LocationLink = {
      originSelectionRange,
      targetUri,
      targetRange,
      targetSelectionRange: targetRange,
    };
    return [link];
  }
}
