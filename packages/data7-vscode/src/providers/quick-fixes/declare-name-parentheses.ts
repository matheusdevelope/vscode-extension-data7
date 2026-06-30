import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";

import { hasDiagnosticCode } from "../code-action-helpers";

export function addDeclareNameParenthesesFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction(
    "Remover parênteses do nome do Declare",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, diagnostic.range);
  action.edit = edit;
  actions.push(action);
}

export function addDeclareNameParenthesesBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.DeclareNameParentheses),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover parênteses do nome de todos os Declares deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of mismatches) {
    edit.delete(document.uri, match.range);
  }
  action.edit = edit;
  actions.push(action);
}
