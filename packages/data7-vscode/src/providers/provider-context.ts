import * as vscode from "vscode";
import { tokenizeLine } from "@data7/core";

export function isPositionInCommentOrString(
  document: vscode.TextDocument,
  position: vscode.Position,
): boolean {
  const lineText = document.lineAt(position.line).text;
  const tokens = tokenizeLine(lineText, { includeWhitespace: true });
  for (const token of tokens) {
    if (token.kind !== "comment" && token.kind !== "string") continue;
    const start = token.col;
    const end = token.kind === "comment" ? lineText.length : token.col + token.value.length;
    if (position.character >= start && position.character <= end) return true;
  }
  return false;
}
