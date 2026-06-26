import * as vscode from "vscode";
import {
  DiagnosticCodes,
  type ReturnAssignmentInCatchPayload,
} from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addReturnAssignmentInCatchFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<ReturnAssignmentInCatchPayload>(
    diagnostic,
    DiagnosticCodes.ReturnAssignmentInCatch,
  );
  if (!payload) return;

  const resolved = resolveReturnAssignmentInCatchReplacement(document, payload);
  if (!resolved) return;

  const action = new vscode.CodeAction(
    "Substituir atribuição de retorno por Return",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, resolved.range, resolved.replacement);
  action.edit = edit;
  actions.push(action);
}

export function addReturnAssignmentInCatchBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = vscode.languages
    .getDiagnostics(document.uri)
    .filter((candidate) => hasDiagnosticCode(candidate, DiagnosticCodes.ReturnAssignmentInCatch));
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Substituir todas as atribuicoes de retorno em Catch neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const sorted = [...matches].sort((left, right) => right.range.start.line - left.range.start.line);

  let replacementCount = 0;
  for (const match of sorted) {
    const payload = readDiagnosticPayload<ReturnAssignmentInCatchPayload>(
      match,
      DiagnosticCodes.ReturnAssignmentInCatch,
    );
    if (!payload) continue;

    const resolved = resolveReturnAssignmentInCatchReplacement(document, payload);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }

  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

function resolveReturnAssignmentInCatchReplacement(
  document: vscode.TextDocument,
  payload: ReturnAssignmentInCatchPayload,
): { range: vscode.Range; replacement: string } | undefined {
  const line = Math.max(0, Math.min(payload.line, document.lineCount - 1));
  const lineText = document.lineAt(line).text;
  const startChar = Math.max(0, Math.min(payload.startChar, lineText.length));
  const endChar = Math.max(startChar, Math.min(payload.endChar, lineText.length));
  const expressionFromLine = expressionFromAssignment(lineText, startChar);
  const expressionText =
    expressionFromLine &&
    (!payload.expressionText || expressionFromLine.startsWith(payload.expressionText))
      ? expressionFromLine
      : payload.expressionText;
  const commentSuffix = inlineCommentSuffix(lineText, startChar);
  if (!expressionText || expressionText.trim().length === 0) return undefined;

  return {
    range: new vscode.Range(line, startChar, line, endChar),
    replacement: `Return ${expressionText.trim()}${commentSuffix}`,
  };
}

function expressionFromAssignment(lineText: string, startChar: number): string {
  const commentStart = findInlineCommentColumn(lineText, startChar);
  const codeEnd = commentStart === -1 ? lineText.length : commentStart;
  const eqIndex = lineText.indexOf("=", startChar);
  return eqIndex === -1 ? "" : lineText.slice(eqIndex + 1, codeEnd).trim();
}

function inlineCommentSuffix(lineText: string, startColumn: number): string {
  const commentStart = findInlineCommentColumn(lineText, startColumn);
  return commentStart === -1 ? "" : ` ${lineText.slice(commentStart).trim()}`;
}

function findInlineCommentColumn(lineText: string, startColumn: number): number {
  let inString = false;
  for (let index = startColumn; index < lineText.length; index++) {
    const char = lineText[index];
    if (char === '"') {
      if (inString && lineText[index + 1] === '"') {
        index++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && char === "'") return index;
  }
  return -1;
}
