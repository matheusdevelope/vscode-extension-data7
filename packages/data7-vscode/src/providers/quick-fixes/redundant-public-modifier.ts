import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { RedundantPublicModifierPayload } from "@data7/core";

import {
  dedupeDiagnostics,
  hasDiagnosticCode,
  readDiagnosticPayload,
} from "../code-action-helpers";

export function addRedundantPublicModifierFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<RedundantPublicModifierPayload>(
    diagnostic,
    DiagnosticCodes.RedundantPublicModifier,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    "Remover modificador Public",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  const lineText = document.lineAt(payload.line).text;
  const afterPublic = lineText[payload.endChar] === " " ? payload.endChar + 1 : payload.endChar;
  edit.delete(
    document.uri,
    new vscode.Range(payload.line, payload.startChar, payload.line, afterPublic),
  );
  action.edit = edit;
  actions.push(action);
}

export function addRedundantPublicModifierBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.RedundantPublicModifier)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todos os modificadores Public neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...matches].sort(
    (a, b) =>
      b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character,
  );
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    const payload = readDiagnosticPayload<RedundantPublicModifierPayload>(
      match,
      DiagnosticCodes.RedundantPublicModifier,
    );
    if (!payload) continue;
    const lineText = document.lineAt(payload.line).text;
    const afterPublic = lineText[payload.endChar] === " " ? payload.endChar + 1 : payload.endChar;
    edit.delete(
      document.uri,
      new vscode.Range(payload.line, payload.startChar, payload.line, afterPublic),
    );
  }
  action.edit = edit;
  actions.push(action);
}
