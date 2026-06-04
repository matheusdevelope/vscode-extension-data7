import * as fs from "fs";
import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { LanguageProcessor } from "../analysis/language-processor";

const VALID_NEW_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Implements `F2` Rename for Data7 Basic.
 * Uses tokens from LanguageProcessor for safe, precise renaming.
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

    // Rewrite the active document first (uses current buffer, not disk).
    rewriteDocument(edit, document.uri, document.getText(), oldName, newName);

    // Then every indexed file from the workspace.
    for (const fileSyms of this.indexer.getAllFileSymbols()) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (token.isCancellationRequested) return undefined;
      if (fileSyms.fileUri === document.uri.toString()) continue;
      try {
        const text = readFileTextSafely(fileSyms.filePath);
        rewriteDocument(edit, vscode.Uri.parse(fileSyms.fileUri), text, oldName, newName);
      } catch {
        // skip unreadable files
      }
    }

    return edit;
  }

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
  oldName: string,
  newName: string,
): void {
  const cached = LanguageProcessor.getInstance().getOrParse(uri.toString(), fullText);
  const tokens = cached.tokens;
  for (const t of tokens) {
    if (t.kind === "identifier" && t.value.toLowerCase() === oldName.toLowerCase()) {
      const line = Math.max(0, t.loc.line - 1);
      const start = new vscode.Position(line, t.loc.column);
      const end = new vscode.Position(line, t.loc.column + t.value.length);
      edit.replace(uri, new vscode.Range(start, end), newName);
    }
  }
}

function readFileTextSafely(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
