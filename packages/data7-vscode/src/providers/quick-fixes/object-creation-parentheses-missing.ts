import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";

import {
  findObjectCreationParenthesesInsertPosition,
  hasDiagnosticCode,
} from "../code-action-helpers";

export function addObjectCreationParenthesesMissingFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction(
    "Adicionar parênteses '()' na instanciação",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    findObjectCreationParenthesesInsertPosition(document, diagnostic),
    "()",
  );
  action.edit = edit;
  actions.push(action);
}

export function addObjectCreationParenthesesMissingBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.ObjectCreationParenthesesMissing),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Adicionar parênteses '()' em todas as instanciações deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of mismatches) {
    edit.insert(document.uri, findObjectCreationParenthesesInsertPosition(document, match), "()");
  }
  action.edit = edit;
  actions.push(action);
}
