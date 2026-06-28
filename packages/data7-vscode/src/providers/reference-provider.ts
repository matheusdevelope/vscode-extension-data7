import * as fs from "fs";
import * as vscode from "vscode";
import { LanguageProcessor, WorkspaceSymbolIndexer } from "@data7/core";

/**
 * Provides "Find All References" (Shift+F12) for Data7 Basic identifiers.
 * Uses tokens from LanguageProcessor to ensure high-fidelity matches.
 */
export class D7BasicReferenceProvider implements vscode.ReferenceProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Location[]> {
    if (token.isCancellationRequested) return undefined;

    const range = document.getWordRangeAtPosition(position);
    if (!range) return [];
    const word = document.getText(range);
    if (!word || word.length < 2) return [];

    const results: vscode.Location[] = [];
    const seenFiles = new Set<string>();

    const scan = (uri: string, fullText: string): void => {
      if (seenFiles.has(uri)) return;
      seenFiles.add(uri);

      const cached = LanguageProcessor.getInstance().getOrParse(uri, fullText);
      const tokens = cached.tokens;
      for (const t of tokens) {
        if (t.kind === "identifier" && t.value.toLowerCase() === word.toLowerCase()) {
          const line = Math.max(0, t.loc.line - 1);
          const start = new vscode.Position(line, t.loc.column);
          const end = new vscode.Position(line, t.loc.column + t.value.length);
          results.push(new vscode.Location(vscode.Uri.parse(uri), new vscode.Range(start, end)));
        }
      }
    };

    // Active document always counted (so unsaved edits show up).
    scan(document.uri.toString(), document.getText());

    // Every indexed file.
    for (const fileSyms of this.indexer.getAllFileSymbols()) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (token.isCancellationRequested) return undefined;
      try {
        scan(fileSyms.fileUri, readFileTextSafely(fileSyms.filePath));
      } catch {
        // ignore unreadable files
      }
    }

    if (!context.includeDeclaration) {
      const declaration = this.indexer.findSymbolByName(word);
      if (declaration) {
        const declUri = declaration.fileUri;
        const declLine = declaration.range.startLine;
        let declChar = declaration.range.startChar;

        // Resolve the exact column of the identifier token on the declaration line
        const declCached = LanguageProcessor.getInstance().getOrParse(declUri);
        const declToken = declCached.tokens.find(
          (t) =>
            t.loc.line === declLine + 1 && t.value.toLowerCase() === declaration.name.toLowerCase(),
        );
        if (declToken) {
          declChar = declToken.loc.column;
        }

        return results.filter(
          (loc) =>
            !(
              loc.uri.toString() === declUri &&
              loc.range.start.line === declLine &&
              loc.range.start.character === declChar
            ),
        );
      }
    }
    return results;
  }
}

function readFileTextSafely(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
