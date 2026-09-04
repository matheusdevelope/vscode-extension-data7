import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { QualifiedPrivateSharedAccessPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addQualifiedPrivateSharedAccessFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<QualifiedPrivateSharedAccessPayload>(
    diagnostic,
    DiagnosticCodes.QualifiedPrivateSharedAccess,
  );
  if (!payload) return;
  const resolved = resolveUnqualifiedReplacement(document, payload);
  if (!resolved) return;

  const action = new vscode.CodeAction(
    `Acessar "${payload.memberName}" sem o nome da classe`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, resolved.range, resolved.replacement);
  action.edit = edit;
  actions.push(action);
}

export function addQualifiedPrivateSharedAccessBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = vscode.languages
    .getDiagnostics(document.uri)
    .filter((candidate) =>
      hasDiagnosticCode(candidate, DiagnosticCodes.QualifiedPrivateSharedAccess),
    );
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover o nome da classe em todos os acessos Private Shared neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  let replacementCount = 0;
  for (const match of matches) {
    const payload = readDiagnosticPayload<QualifiedPrivateSharedAccessPayload>(
      match,
      DiagnosticCodes.QualifiedPrivateSharedAccess,
    );
    if (!payload) continue;
    const resolved = resolveUnqualifiedReplacement(document, payload);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }
  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

function resolveUnqualifiedReplacement(
  document: vscode.TextDocument,
  payload: QualifiedPrivateSharedAccessPayload,
): { range: vscode.Range; replacement: string } | undefined {
  if (!payload.memberName.trim()) return undefined;
  const line = Math.max(0, Math.min(payload.line, document.lineCount - 1));
  const lineText = document.lineAt(line).text;
  const startChar = Math.max(0, Math.min(payload.startChar, lineText.length));
  const endChar = Math.max(startChar, Math.min(payload.endChar, lineText.length));
  if (endChar <= startChar) return undefined;
  return {
    range: new vscode.Range(line, startChar, line, endChar),
    replacement: payload.memberName,
  };
}
