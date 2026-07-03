import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { UnusedDeclarationPayload } from "@data7/core";

import {
  dedupeDiagnostics,
  hasDiagnosticCode,
  readDiagnosticPayload,
} from "../code-action-helpers";

export function addUnusedDeclarationFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnusedDeclarationPayload>(
    diagnostic,
    DiagnosticCodes.UnusedDeclaration,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    "Remover declaração não usada",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const line = document.lineAt(payload.line);
  const range =
    payload.line < document.lineCount - 1
      ? new vscode.Range(payload.line, 0, payload.line + 1, 0)
      : new vscode.Range(payload.line, 0, payload.line, line.text.length);
  edit.delete(document.uri, range);
  action.edit = edit;
  actions.push(action);
}

export function addUnusedDeclarationBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.UnusedDeclaration)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todas as declarações não usadas neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...matches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    const payload = readDiagnosticPayload<UnusedDeclarationPayload>(
      match,
      DiagnosticCodes.UnusedDeclaration,
    );
    if (!payload) continue;
    const line = document.lineAt(payload.line);
    const range =
      payload.line < document.lineCount - 1
        ? new vscode.Range(payload.line, 0, payload.line + 1, 0)
        : new vscode.Range(payload.line, 0, payload.line, line.text.length);
    edit.delete(document.uri, range);
  }
  action.edit = edit;
  actions.push(action);
}
