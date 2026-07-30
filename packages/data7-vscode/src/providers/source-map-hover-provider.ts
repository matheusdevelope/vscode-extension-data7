import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as vscode from "vscode";
import { resolveSourceMapContext } from "./source-map-provider-context";

function displayPath(fileUri: string): string {
  try {
    if (fileUri.startsWith("file:")) {
      return fileURLToPath(fileUri);
    }
  } catch {
    // fall through
  }
  return fileUri;
}

/**
 * Hover inside a built `.7Proj`: shows the original `.bas` path/line and
 * demangles uglified identifiers via the source-map symbol table.
 */
export class D7ProjectSourceMapHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    if (token.isCancellationRequested) return undefined;

    const context = resolveSourceMapContext(document, position);
    if (!context || token.isCancellationRequested) return undefined;

    const originalPath = displayPath(context.original.fileUri);
    const relative =
      vscode.workspace.asRelativePath(vscode.Uri.parse(context.original.fileUri), false) ||
      path.basename(originalPath);
    const humanLine = context.original.line + 1;

    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.isTrusted = false;
    markdown.appendMarkdown(`**Origem:** \`${relative}\` · linha ${humanLine.toString()}\n\n`);
    markdown.appendMarkdown(`Módulo gerado: \`${context.moduleName}\`\n`);

    if (context.word) {
      const symbol = context.lookup.findSymbolByGeneratedName(context.word, {
        fileUri: context.original.fileUri,
      });
      if (symbol && symbol.originalName !== symbol.generatedName) {
        markdown.appendMarkdown(
          `\n\`${symbol.generatedName}\` → \`${symbol.originalName}\` (${symbol.kind})`,
        );
      }
    }

    const lineRange = new vscode.Range(
      position.line,
      0,
      position.line,
      document.lineAt(position.line).text.length,
    );
    return new vscode.Hover(markdown, lineRange);
  }
}
