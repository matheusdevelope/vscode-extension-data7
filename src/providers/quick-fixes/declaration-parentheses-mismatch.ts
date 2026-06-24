import * as vscode from "vscode";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import {
  findDeclarationParenthesesInsertPosition,
  hasDiagnosticCode,
} from "../code-action-helpers";

export function addDeclarationParenthesesMismatchFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction("Adicionar parênteses '()'", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, findDeclarationParenthesesInsertPosition(document, diagnostic), "()");
  action.edit = edit;
  actions.push(action);
}

export function addDeclarationParenthesesMismatchBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.DeclarationParenthesesMismatch),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Adicionar parênteses '()' em todas as declarações deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of mismatches) {
    edit.insert(document.uri, findDeclarationParenthesesInsertPosition(document, match), "()");
  }
  action.edit = edit;
  actions.push(action);
}
