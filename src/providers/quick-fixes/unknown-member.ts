import * as vscode from "vscode";
import { DiagnosticCodes, type UnknownMemberPayload } from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addDidYouMeanFixes(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnknownMemberPayload>(
    diagnostic,
    DiagnosticCodes.UnknownMember,
  );
  if (!payload || payload.suggestions.length === 0) return;

  payload.suggestions.forEach((suggestion, idx) => {
    const action = new vscode.CodeAction(
      `Você quis dizer "${suggestion}"?`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    if (idx === 0) action.isPreferred = true;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, diagnostic.range, suggestion);
    action.edit = edit;
    actions.push(action);
  });
}

export function addDidYouMeanBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.UnknownMember));
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir todos os membros desconhecidos neste arquivo com a primeira sugestão",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  let appliedCount = 0;

  for (const match of sorted) {
    const payload = readDiagnosticPayload<UnknownMemberPayload>(
      match,
      DiagnosticCodes.UnknownMember,
    );
    if (payload && payload.suggestions.length > 0) {
      edit.replace(document.uri, match.range, payload.suggestions[0]!);
      appliedCount++;
    }
  }

  if (appliedCount === 0) return;
  action.edit = edit;
  actions.push(action);
}
