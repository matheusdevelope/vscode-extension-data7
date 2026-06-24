import * as vscode from "vscode";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode } from "../code-action-helpers";

export function addMissingMyBaseNewFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction(
    "Adicionar chamada 'MyBase.New()'",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  // Sub New header is on diagnostic.range.start.line.
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const indentMatch = /^(\s*)/.exec(lineText);
  const indent = indentMatch?.[1] ?? "";

  const edit = new vscode.WorkspaceEdit();
  // Insert on the next line inside the Sub.
  edit.insert(document.uri, new vscode.Position(line + 1, 0), `${indent}  MyBase.New()\n`);
  action.edit = edit;
  actions.push(action);
}

export function addMissingMyBaseNewBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.MissingMyBaseNew),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Adicionar chamada 'MyBase.New()' em todos os construtores deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  // Sort descending by line to avoid offset shifts.
  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
  for (const match of sorted) {
    const line = match.range.start.line;
    const lineText = document.lineAt(line).text;
    const indentMatch = /^(\s*)/.exec(lineText);
    const indent = indentMatch?.[1] ?? "";
    edit.insert(document.uri, new vscode.Position(line + 1, 0), `${indent}  MyBase.New()\n`);
  }
  action.edit = edit;
  actions.push(action);
}
