import * as vscode from "vscode";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { dedupeDiagnostics, hasDiagnosticCode } from "../code-action-helpers";

export function addElseIfWhitespaceFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction("Substituir por 'ElseIf'", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, diagnostic.range, "ElseIf");
  action.edit = edit;
  actions.push(action);
}

export function addElseIfWhitespaceBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const elseifWhitespaces = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.ElseIfWhitespace)),
  ]);
  if (elseifWhitespaces.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir todos os 'Else If' com espaço neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...elseifWhitespaces].sort(
    (a, b) =>
      b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character,
  );
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    edit.replace(document.uri, match.range, "ElseIf");
  }
  action.edit = edit;
  actions.push(action);
}
