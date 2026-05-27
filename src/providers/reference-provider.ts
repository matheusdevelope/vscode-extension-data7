import * as fs from "fs";
import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { escapeForRegex } from "../utils/regex-helpers";

/**
 * Provides "Find All References" (Shift+F12) for Data7 Basic identifiers.
 *
 * Strategy:
 *  1. Identify the word at the cursor.
 *  2. Look up every indexed `.bas` file the indexer knows about plus the active
 *     document. For each, scan with a whole-word regex (case-insensitive,
 *     since Data7 Basic is case-insensitive in practice).
 *  3. Skip matches that appear inside comments or string literals — we use the
 *     same `stripComments` helper that already powers the linter.
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
      const cleaned = DependencyScanner.stripComments(fullText);
      const lines = cleaned.split(/\r?\n/);
      const regex = new RegExp(`\\b${escapeForRegex(word)}\\b`, "gi");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match: RegExpExecArray | null;
        regex.lastIndex = 0;
        while ((match = regex.exec(line)) !== null) {
          const start = new vscode.Position(i, match.index);
          const end = new vscode.Position(i, match.index + word.length);
          results.push(new vscode.Location(vscode.Uri.parse(uri), new vscode.Range(start, end)));
        }
      }
    };

    // Active document always counted (so unsaved edits show up).
    scan(document.uri.toString(), document.getText());

    // Every indexed file.
    for (const fileSyms of this.indexer.getAllFileSymbols()) {
      // The token can flip asynchronously while we iterate; TS sees the
      // property as a stable boolean and flags the runtime guard as redundant.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (token.isCancellationRequested) return undefined;
      try {
        scan(fileSyms.fileUri, readFileTextSafely(fileSyms.filePath));
      } catch {
        // ignore unreadable files
      }
    }

    if (!context.includeDeclaration) {
      // Filter out the symbol's own declaration when the caller asked for
      // references only (`Peek References` panel). We look the declaration up
      // via the indexer — if it matches one of our scanned `Location`s by URI
      // + line + start-column, we drop it.
      const declaration = this.indexer.findSymbolByName(word);
      if (declaration) {
        const declUri = declaration.fileUri;
        const declLine = declaration.range.startLine;
        const declChar = declaration.range.startChar;
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
