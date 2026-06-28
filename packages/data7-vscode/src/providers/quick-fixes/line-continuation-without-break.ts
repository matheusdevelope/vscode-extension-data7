import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";

import { dedupeDiagnostics, hasDiagnosticCode } from "../code-action-helpers";

export function addLineContinuationWithoutBreakFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction(
    "Remover '_' de continuacao de linha",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, diagnostic.range);
  action.edit = edit;
  actions.push(action);
}

export function addLineContinuationWithoutBreakBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.LineContinuationWithoutBreak)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todos os '_' de continuacao de linha sem quebra neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of matches) {
    edit.delete(document.uri, match.range);
  }
  action.edit = edit;
  actions.push(action);
}
