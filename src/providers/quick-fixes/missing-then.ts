import * as vscode from "vscode";
import { DiagnosticCodes, type MissingThenPayload } from "../../diagnostics/diagnostic-codes";
import {
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
  const missingThen = dedupeMissingThenDiagnostics(document, [
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

/**
 * Parser recovery can expose `expected-token` alongside the structured
 * `missing-then` diagnostic for the same source location. Collapse by the
 * effective insertion point so a bulk edit never inserts `Then` twice.
 */
function dedupeMissingThenDiagnostics(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): vscode.Diagnostic[] {
  const seenPositions = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const payload = readDiagnosticPayload<MissingThenPayload>(
      diagnostic,
      DiagnosticCodes.MissingThen,
    );
    const position = payload
      ? new vscode.Position(payload.line, payload.insertColumn)
      : findMissingThenInsertPosition(document, diagnostic);
    const key = `${position.line}:${position.character}`;
    if (seenPositions.has(key)) return false;
    seenPositions.add(key);
    return true;
  });
}
