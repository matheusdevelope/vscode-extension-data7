import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { DeadCodePayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addDeadCodeCommentFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<DeadCodePayload>(diagnostic, DiagnosticCodes.DeadCode);
  if (!payload) return;

  const action = new vscode.CodeAction("Comentar bloco morto", vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  action.edit = buildCommentEdit(document, [payload]);
  actions.push(action);
}

export function addDeadCodeCommentBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payloads = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diag) => hasDiagnosticCode(diag, DiagnosticCodes.DeadCode))
    .map((diag) => readDiagnosticPayload<DeadCodePayload>(diag, DiagnosticCodes.DeadCode))
    .filter((payload): payload is DeadCodePayload => payload !== undefined);
  if (payloads.length <= 1) return;

  const action = new vscode.CodeAction(
    "Comentar todos os blocos mortos neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.edit = buildCommentEdit(document, payloads);
  actions.push(action);
}

function buildCommentEdit(
  document: vscode.TextDocument,
  payloads: readonly DeadCodePayload[],
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();
  const lines = new Set<number>();
  for (const payload of payloads) {
    for (let line = payload.startLine; line <= payload.endLine; line++) {
      lines.add(line);
    }
  }

  for (const line of [...lines].sort((a, b) => a - b)) {
    const lineText = document.lineAt(line).text;
    if (/^\s*'/.test(lineText)) continue;
    const indentLength = lineText.length - lineText.trimStart().length;
    edit.insert(document.uri, new vscode.Position(line, indentLength), "' ");
  }
  return edit;
}
