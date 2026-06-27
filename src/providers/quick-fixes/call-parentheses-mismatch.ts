import * as vscode from "vscode";
import {
  DiagnosticCodes,
  type CallParenthesesMismatchPayload,
} from "../../diagnostics/diagnostic-codes";
import { readDiagnosticPayload } from "../code-action-helpers";

export function addCallParenthesesMismatchFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<CallParenthesesMismatchPayload>(
    diagnostic,
    DiagnosticCodes.CallParenthesesMismatch,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    "Adicionar parenteses '()' na chamada",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, new vscode.Position(payload.line, payload.insertColumn), "()");
  action.edit = edit;
  actions.push(action);
}
