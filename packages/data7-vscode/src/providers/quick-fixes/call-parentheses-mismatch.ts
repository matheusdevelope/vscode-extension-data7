import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { CallParenthesesMismatchPayload } from "@data7/core";

import {
  dedupeDiagnostics,
  hasDiagnosticCode,
  readDiagnosticPayload,
} from "../code-action-helpers";

function isFixableCallParenthesesPayload(
  payload: CallParenthesesMismatchPayload | undefined,
  document: vscode.TextDocument,
): payload is CallParenthesesMismatchPayload {
  if (!payload) return false;
  if (payload.wrapRange) return true;

  // Inserting "()" is only valid when the call site does not already have parentheses.
  // Arity-mismatch diagnostics must not carry a payload; this guard is a safety net against
  // turning `foo(arg)` into `foo()(arg)` if a payload is attached incorrectly.
  const line = document.lineAt(payload.line).text;
  const after = line.slice(payload.insertColumn);
  return !/^\s*\(/.test(after);
}

function applyCallParenthesesEdit(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  payload: CallParenthesesMismatchPayload,
): void {
  if (payload.wrapRange) {
    const line = document.lineAt(payload.line);
    const leading = line.text.slice(0, payload.insertColumn);
    const argumentText = line.text.slice(payload.wrapRange.startChar, payload.wrapRange.endChar);
    const suffix = line.text.slice(payload.wrapRange.endChar);
    const fixedLine = `${leading}(${argumentText.trim()})${suffix}`;
    edit.replace(document.uri, line.range, fixedLine);
    return;
  }

  edit.insert(document.uri, new vscode.Position(payload.line, payload.insertColumn), "()");
}

export function addCallParenthesesMismatchFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<CallParenthesesMismatchPayload>(
    diagnostic,
    DiagnosticCodes.CallParenthesesMismatch,
  );
  if (!isFixableCallParenthesesPayload(payload, document)) return;

  const action = new vscode.CodeAction(
    "Adicionar parenteses '()' na chamada",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  applyCallParenthesesEdit(edit, document, payload);
  action.edit = edit;
  actions.push(action);
}

export function addCallParenthesesMismatchBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.CallParenthesesMismatch)),
  ]).filter((match) =>
    isFixableCallParenthesesPayload(
      readDiagnosticPayload<CallParenthesesMismatchPayload>(
        match,
        DiagnosticCodes.CallParenthesesMismatch,
      ),
      document,
    ),
  );
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Adicionar parenteses '()' em todas as chamadas deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...matches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    const payload = readDiagnosticPayload<CallParenthesesMismatchPayload>(
      match,
      DiagnosticCodes.CallParenthesesMismatch,
    );
    if (!isFixableCallParenthesesPayload(payload, document)) continue;
    applyCallParenthesesEdit(edit, document, payload);
  }
  action.edit = edit;
  actions.push(action);
}
