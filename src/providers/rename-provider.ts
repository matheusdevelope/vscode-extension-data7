import * as fs from "fs";
import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { escapeForRegex } from "../utils/regex-helpers";
import { stripCommentsAndStrings } from "../utils/code-stripper";

const VALID_NEW_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Implements `F2` Rename for Data7 Basic.
 *
 * Safety scope (intentionally conservative):
 *
 *  - Only `class`, `structure`, `namespace`, `method`, `delegate`,
 *    `declare_sub` and `declare_function` symbols are renameable.
 *  - Variables and properties are NOT renameable — they need full scope
 *    analysis to avoid renaming unrelated occurrences (e.g. shadowed locals).
 *  - System Library symbols are NOT renameable — they live outside the
 *    workspace and are owned by the extension.
 *  - Rename only rewrites occurrences in indexed `.bas` workspace files.
 *
 * Implementation uses whole-word case-insensitive matching against the cleaned
 * (comment-stripped) text. Inside comments / strings we don't touch.
 */
export class D7BasicRenameProvider implements vscode.RenameProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    if (token.isCancellationRequested) return undefined;
    const range = document.getWordRangeAtPosition(position);
    if (!range) throw new Error("Cursor não está sobre um identificador renomeável.");

    const word = document.getText(range);
    const symbol = this.findRenameableSymbol(word);
    if (!symbol) {
      throw new Error(
        `O símbolo "${word}" não é renomeável (apenas classes, métodos, namespaces e structures do workspace podem ser renomeados).`,
      );
    }
    return { range, placeholder: word };
  }

  public provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    if (token.isCancellationRequested) return undefined;

    if (!VALID_NEW_NAME_RE.test(newName)) {
      throw new Error(
        "O novo nome deve começar com letra ou underscore e conter apenas letras, dígitos e underscores.",
      );
    }

    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;
    const oldName = document.getText(range);
    if (oldName === newName) return new vscode.WorkspaceEdit();

    const symbol = this.findRenameableSymbol(oldName);
    if (!symbol) return undefined;

    const edit = new vscode.WorkspaceEdit();
    const wordRegex = new RegExp(`\\b${escapeForRegex(oldName)}\\b`, "gi");

    // Rewrite the active document first (uses current buffer, not disk).
    rewriteDocument(edit, document.uri, document.getText(), wordRegex, newName);

    // Then every indexed file from the workspace.
    for (const fileSyms of this.indexer.getAllFileSymbols()) {
      // The token state can flip asynchronously while we iterate, even though
      // TS sees the property as a stable `boolean` after the first read.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (token.isCancellationRequested) return undefined;
      if (fileSyms.fileUri === document.uri.toString()) continue;
      try {
        const text = readFileTextSafely(fileSyms.filePath);
        rewriteDocument(edit, vscode.Uri.parse(fileSyms.fileUri), text, wordRegex, newName);
      } catch {
        // skip unreadable files
      }
    }

    return edit;
  }

  // -------------------------------------------------------------------------

  private findRenameableSymbol(name: string): SymbolInfo | undefined {
    const lowerName = name.toLowerCase();
    const allowedKinds: readonly SymbolInfo["kind"][] = [
      "class",
      "structure",
      "namespace",
      "method",
      "delegate",
      "declare_sub",
      "declare_function",
    ];
    return this.indexer
      .getAllSymbols()
      .find((s) => s.name.toLowerCase() === lowerName && allowedKinds.includes(s.kind));
  }
}

function rewriteDocument(
  edit: vscode.WorkspaceEdit,
  uri: vscode.Uri,
  fullText: string,
  wordRegex: RegExp,
  newName: string,
): void {
  // Match against the COMMENT- and STRING-stripped text so we never touch
  // occurrences inside line comments or string literals — e.g., renaming
  // `Greeter` must NOT rewrite the literal `"Greeter foi salvo"`.
  // The stripper preserves column positions (each removed character becomes
  // a space) so match offsets map cleanly back to the original document.
  const cleaned = stripCommentsAndStrings(fullText);
  const lines = cleaned.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m: RegExpExecArray | null;
    wordRegex.lastIndex = 0;
    while ((m = wordRegex.exec(line)) !== null) {
      const start = new vscode.Position(i, m.index);
      const end = new vscode.Position(i, m.index + m[0].length);
      edit.replace(uri, new vscode.Range(start, end), newName);
    }
  }
}

function readFileTextSafely(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
