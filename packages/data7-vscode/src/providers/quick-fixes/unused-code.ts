import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { UnusedCodePayload } from "@data7/core";

import {
  dedupeDiagnostics,
  hasDiagnosticCode,
  readDiagnosticPayload,
} from "../code-action-helpers";

function deleteRangeForPayload(
  document: vscode.TextDocument,
  payload: UnusedCodePayload,
): vscode.Range {
  const startLine = payload.line;
  const endLine = Math.min(document.lineCount - 1, payload.endLine ?? payload.line);
  if (endLine < document.lineCount - 1) {
    return new vscode.Range(startLine, 0, endLine + 1, 0);
  }
  const endLineText = document.lineAt(endLine).text;
  return new vscode.Range(startLine, 0, endLine, endLineText.length);
}

export function addUnusedCodeFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnusedCodePayload>(diagnostic, DiagnosticCodes.UnusedCode);
  if (!payload) return;

  const action = new vscode.CodeAction(
    "Remover declaração não usada",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, deleteRangeForPayload(document, payload));
  action.edit = edit;
  actions.push(action);
}

export function addUnusedCodeBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.UnusedCode)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todas as declarações não usadas (projeto) neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...matches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    const payload = readDiagnosticPayload<UnusedCodePayload>(match, DiagnosticCodes.UnusedCode);
    if (!payload) continue;
    edit.delete(document.uri, deleteRangeForPayload(document, payload));
  }
  action.edit = edit;
  actions.push(action);
}
