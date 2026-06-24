import * as vscode from "vscode";
import { DiagnosticCodes, type MissingThenPayload } from "../../diagnostics/diagnostic-codes";
import {
  dedupeDiagnostics,
  findMissingThenInsertPosition,
  hasDiagnosticCode,
  isMissingThenDiagnostic,
  readDiagnosticPayload,
} from "../code-action-helpers";

export function addMissingThenFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = new vscode.CodeAction("Adicionar 'Then'", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const payload = readDiagnosticPayload<MissingThenPayload>(
    diagnostic,
    DiagnosticCodes.MissingThen,
  );
  const pos = payload
    ? new vscode.Position(payload.line, payload.insertColumn)
    : findMissingThenInsertPosition(document, diagnostic);

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, pos, " Then");
  action.edit = edit;
  actions.push(action);
}

export function addMissingThenBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const missingThen = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter(
      (d) => isMissingThenDiagnostic(d) || hasDiagnosticCode(d, DiagnosticCodes.MissingThen),
    ),
  ]);
  if (missingThen.length <= 1) return;

  const action = new vscode.CodeAction(
    "Adicionar 'Then' em todas as ocorrências deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  for (const match of missingThen) {
    const payload = readDiagnosticPayload<MissingThenPayload>(match, DiagnosticCodes.MissingThen);
    const pos = payload
      ? new vscode.Position(payload.line, payload.insertColumn)
      : findMissingThenInsertPosition(document, match);
    edit.insert(document.uri, pos, " Then");
  }
  action.edit = edit;
  actions.push(action);
}
