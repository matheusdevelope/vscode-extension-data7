import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { getChainPrefix } from "../utils/chain-parser";

export class D7BasicDefinitionProvider implements vscode.DefinitionProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Definition | vscode.LocationLink[]> {
    if (token.isCancellationRequested) return undefined;
    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;

    const word = document.getText(range);
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, range.start.character).trim();

    let targetSymbol: SymbolInfo | undefined;

    // Case A: Cursor is on a member call (e.g., `obj.Member` or `me.Member`)
    if (textBeforeCursor.endsWith(".")) {
      const dotIndex = lineText.lastIndexOf(".", range.start.character);
      if (dotIndex !== -1) {
        const prefix = getChainPrefix(lineText, dotIndex);
        const prefixLower = prefix.toLowerCase();

        if (prefixLower === "me" || prefixLower === "mybase") {
          // Find current class context
          const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
          if (fileSyms) {
            const currentClass = fileSyms.symbols.find(
              (s) =>
                s.kind === "class" &&
                position.line >= s.range.startLine &&
                position.line <= s.range.endLine,
            );
            if (currentClass) {
              // Resolve in current class + ancestors (workspace AND system library).
              targetSymbol = TypeResolver.findMember(currentClass.name, word, this.indexer);
            }
          }
        } else {
          // Try resolving the type of the entire prefix expression (supports complex/nested chains)
          const typeName = TypeResolver.inferExpressionType(
            prefix,
            document,
            position.line,
            this.indexer,
          );
          if (typeName) {
            targetSymbol = TypeResolver.findMember(typeName, word, this.indexer);
          } else {
            const lastWordMatch = /([a-zA-Z0-9_]+)$/.exec(prefix);

            if (lastWordMatch?.[1]) {
              const triggerWord = lastWordMatch[1];
              // Resolve variable type or namespace
              let typeName = TypeResolver.getVariableType(
                triggerWord,
                document,
                position,
                this.indexer,
              );
              // Try to treat triggerWord as class or namespace itself.
              typeName ??= this.indexer.findSymbolByName(
                triggerWord,
                document.uri.toString(),
              )?.name;

              if (typeName) {
                targetSymbol = TypeResolver.findMember(typeName, word, this.indexer);
              }
            }
          }
        }
      }
    }

    // Case B: Global/Standalone Reference (e.g. Type, ClassName, namespace, helper function)
    targetSymbol ??= this.indexer.findSymbolByName(word, document.uri.toString());

    if (!targetSymbol) {
      const genericParams = TypeResolver.getGenericParametersInScope(
        document,
        position,
        this.indexer,
      );
      const constraint = genericParams.get(word.toLowerCase());
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
