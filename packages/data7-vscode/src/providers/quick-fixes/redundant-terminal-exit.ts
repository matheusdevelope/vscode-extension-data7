import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";

import { dedupeDiagnostics, hasDiagnosticCode } from "../code-action-helpers";

export function addRedundantTerminalExitFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction(
    "Remover comando terminal redundante",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, getWholeLineRange(document, diagnostic.range.start.line));
  action.edit = edit;
  actions.push(action);
}

export function addRedundantTerminalExitBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.RedundantTerminalExit)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todos os comandos terminais redundantes neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of [...matches].sort(
    (left, right) => right.range.start.line - left.range.start.line,
  )) {
    edit.delete(document.uri, getWholeLineRange(document, match.range.start.line));
  }
  action.edit = edit;
  actions.push(action);
}

function getWholeLineRange(document: vscode.TextDocument, line: number): vscode.Range {
  const safeLine = Math.max(0, Math.min(line, document.lineCount - 1));
  if (safeLine < document.lineCount - 1) {
    return new vscode.Range(safeLine, 0, safeLine + 1, 0);
  }
  const lineText = document.lineAt(safeLine).text;
  return new vscode.Range(safeLine, 0, safeLine, lineText.length);
}
