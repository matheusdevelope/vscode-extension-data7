import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { SharedReturnGlobalFunctionPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addSharedReturnGlobalFunctionFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<SharedReturnGlobalFunctionPayload>(
    diagnostic,
    DiagnosticCodes.SharedReturnGlobalFunction,
  );
  if (!payload) return;

  const resolved = resolveSharedReturnGlobalFunctionReplacement(document, payload);
  if (!resolved) return;

  const action = new vscode.CodeAction(
    "Armazenar retorno global em variavel temporaria",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = false;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, resolved.range, resolved.replacement);
  action.edit = edit;
  actions.push(action);
}

export function addSharedReturnGlobalFunctionBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = vscode.languages
    .getDiagnostics(document.uri)
    .filter((candidate) =>
      hasDiagnosticCode(candidate, DiagnosticCodes.SharedReturnGlobalFunction),
    );
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Armazenar todos os retornos globais Shared em temporarias neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const sorted = [...matches].sort((left, right) => right.range.start.line - left.range.start.line);

  let replacementCount = 0;
  for (const match of sorted) {
    const payload = readDiagnosticPayload<SharedReturnGlobalFunctionPayload>(
      match,
      DiagnosticCodes.SharedReturnGlobalFunction,
    );
    if (!payload) continue;

    const resolved = resolveSharedReturnGlobalFunctionReplacement(document, payload);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }

  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

function resolveSharedReturnGlobalFunctionReplacement(
  document: vscode.TextDocument,
  payload: SharedReturnGlobalFunctionPayload,
): { range: vscode.Range; replacement: string } | undefined {
  const line = Math.max(0, Math.min(payload.line, document.lineCount - 1));
  const lineText = document.lineAt(line).text;
  const indent = lineText.substring(0, lineText.length - lineText.trimStart().length);
  const startChar = Math.max(0, Math.min(payload.startChar, lineText.length));
  const codeEnd = findInlineCommentColumn(lineText, startChar);
  const commentSuffix = codeEnd === -1 ? "" : ` ${lineText.slice(codeEnd).trim()}`;

  if (!isSupportedSharedReturnLine(lineText, payload, startChar)) return undefined;

  const tempName = payload.tempName.trim();
  const tempType = payload.tempType.trim() || "Variant";
  const rootText = payload.rootText.trim();
  if (!tempName || !rootText || !payload.targetName.trim()) return undefined;

  const eol = getDocumentEol(document);
  const assignedValue = `${tempName}${payload.suffixText.trim()}`;
  const finalReturn = payload.isInsideCatch
    ? `Return ${assignedValue}`
    : `${payload.targetName} = ${assignedValue}${eol}${indent}Exit ${payload.exitType}`;

  const replacement = [
    `${indent}Dim ${tempName} As ${tempType}`,
    `${indent}${tempName} = ${rootText}`,
    `${indent}${finalReturn}${commentSuffix}`,
  ].join(eol);

  return {
    range: new vscode.Range(line, 0, line, lineText.length),
    replacement,
  };
}

function isSupportedSharedReturnLine(
  lineText: string,
  payload: SharedReturnGlobalFunctionPayload,
  startChar: number,
): boolean {
  const prefix = lineText.slice(0, startChar).trim();
  if (/^return\b/i.test(prefix)) return true;
  return new RegExp(`^${escapeRegExp(payload.targetName)}\\s*=\\s*$`, "i").test(prefix);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
