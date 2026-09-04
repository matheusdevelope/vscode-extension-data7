import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { SharedReturnAssignmentInTryPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addSharedReturnAssignmentInTryFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<SharedReturnAssignmentInTryPayload>(
    diagnostic,
    DiagnosticCodes.SharedReturnAssignmentInTry,
  );
  if (!payload) return;

  const returnReplacement = resolveReturnReplacement(document, payload);
  if (returnReplacement) {
    const action = new vscode.CodeAction(
      "Substituir atribuição de retorno por Return",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, returnReplacement.range, returnReplacement.replacement);
    action.edit = edit;
    actions.push(action);
  }

  const tempReplacement = resolveTempVariableReplacement(document, payload);
  if (tempReplacement) {
    const action = new vscode.CodeAction(
      "Atribuir a uma temporária e retornar após o End Try",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = false;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, tempReplacement.dimPosition, tempReplacement.dimText);
    edit.replace(document.uri, tempReplacement.assignmentRange, tempReplacement.assignmentText);
    edit.insert(document.uri, tempReplacement.afterTryPosition, tempReplacement.afterTryText);
    action.edit = edit;
    actions.push(action);
  }
}

export function addSharedReturnAssignmentInTryBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = vscode.languages
    .getDiagnostics(document.uri)
    .filter((candidate) =>
      hasDiagnosticCode(candidate, DiagnosticCodes.SharedReturnAssignmentInTry),
    );
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Substituir todas as atribuições de Shared Function em Try/Catch por Return",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const sorted = [...matches].sort((left, right) => right.range.start.line - left.range.start.line);

  let replacementCount = 0;
  for (const match of sorted) {
    const payload = readDiagnosticPayload<SharedReturnAssignmentInTryPayload>(
      match,
      DiagnosticCodes.SharedReturnAssignmentInTry,
    );
    if (!payload) continue;
    const resolved = resolveReturnReplacement(document, payload);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }

  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

function resolveReturnReplacement(
  document: vscode.TextDocument,
  payload: SharedReturnAssignmentInTryPayload,
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

function resolveTempVariableReplacement(
  document: vscode.TextDocument,
  payload: SharedReturnAssignmentInTryPayload,
):
  | {
      dimPosition: vscode.Position;
      dimText: string;
      assignmentRange: vscode.Range;
      assignmentText: string;
      afterTryPosition: vscode.Position;
      afterTryText: string;
    }
  | undefined {
  if (payload.tryStartLine < 0 || payload.tryEndLine < payload.tryStartLine) return undefined;
  if (payload.tryStartLine >= document.lineCount || payload.tryEndLine >= document.lineCount) {
    return undefined;
  }

  const assignmentLine = Math.max(0, Math.min(payload.line, document.lineCount - 1));
  const assignmentLineText = document.lineAt(assignmentLine).text;
  const startChar = Math.max(0, Math.min(payload.startChar, assignmentLineText.length));
  const expressionFromLine = expressionFromAssignment(assignmentLineText, startChar);
  const expressionText =
    expressionFromLine &&
    (!payload.expressionText || expressionFromLine.startsWith(payload.expressionText))
      ? expressionFromLine
      : payload.expressionText;
  if (!expressionText || expressionText.trim().length === 0) return undefined;
  if (!payload.tempName.trim() || !payload.functionName.trim()) return undefined;

  const tryLineText = document.lineAt(payload.tryStartLine).text;
  const tryIndent = leadingIndent(tryLineText);
  const assignmentIndent = leadingIndent(assignmentLineText);
  const endTryLineText = document.lineAt(payload.tryEndLine).text;
  const endTryIndent = leadingIndent(endTryLineText) || tryIndent;
  const eol = getDocumentEol(document);
  const commentSuffix = inlineCommentSuffix(assignmentLineText, startChar);
  const tempType = payload.tempType.trim() || "Variant";

  return {
    dimPosition: new vscode.Position(payload.tryStartLine, 0),
    dimText: `${tryIndent}Dim ${payload.tempName} As ${tempType}${eol}`,
    assignmentRange: new vscode.Range(assignmentLine, 0, assignmentLine, assignmentLineText.length),
    assignmentText: `${assignmentIndent}${payload.tempName} = ${expressionText.trim()}${commentSuffix}`,
    afterTryPosition: new vscode.Position(payload.tryEndLine, endTryLineText.length),
    afterTryText: `${eol}${endTryIndent}${payload.functionName} = ${payload.tempName}`,
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

function leadingIndent(lineText: string): string {
  const match = /^\s*/.exec(lineText);
  return match?.[0] ?? "";
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

function getDocumentEol(document: vscode.TextDocument): string {
  if ((document.eol as unknown) === 1) return "\n";
  return document.getText().includes("\r\n") ? "\r\n" : "\n";
}
