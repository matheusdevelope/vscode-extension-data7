import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { UnknownTypePayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addUnknownTypeDidYouMeanFixes(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnknownTypePayload>(
    diagnostic,
    DiagnosticCodes.UnknownType,
  );
  const typeName = getUnknownTypeName(document, diagnostic, payload);

  if (payload && payload.suggestions.length > 0) {
    payload.suggestions.forEach((suggestion, idx) => {
      const action = new vscode.CodeAction(
        `Você quis dizer "${suggestion}"?`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      if (idx === 0) action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, diagnostic.range, suggestion);
      action.edit = edit;
      actions.push(action);
    });
  }

  if (typeName) {
    addExternalTypeFixes(actions, document, diagnostic, typeName);
  }
}
function addExternalTypeFixes(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  typeName: string,
): void {
  actions.push(
    createExternalTypeLineFix(document, diagnostic, typeName),
    createExternalTypeScopeFix(document, diagnostic, typeName),
    createExternalTypeFileFix(document, diagnostic, typeName),
  );
}

function createExternalTypeLineFix(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  typeName: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    `Aceitar tipo externo "${typeName}" nesta declaraÃƒÂ§ÃƒÂ£o`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const line = diagnostic.range.start.line;
  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    new vscode.Position(line, document.lineAt(line).text.length),
    ` ' data7:external-type ${typeName}`,
  );
  action.edit = edit;
  return action;
}

function createExternalTypeScopeFix(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  typeName: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    `Aceitar tipo externo "${typeName}" neste escopo`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const scopeLine = findNearestScopeStartLine(document, diagnostic.range.start.line);
  const indent = /^(\s*)/.exec(document.lineAt(scopeLine).text)?.[1] ?? "";
  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    new vscode.Position(scopeLine, 0),
    `${indent}' data7:external-type ${typeName} scope=block${eol}`,
  );
  action.edit = edit;
  return action;
}

function createExternalTypeFileFix(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  typeName: string,
): vscode.CodeAction {
  const action = new vscode.CodeAction(
    `Aceitar tipo externo "${typeName}" neste arquivo`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    new vscode.Position(0, 0),
    `' data7:external-type ${typeName} scope=file${eol}`,
  );
  action.edit = edit;
  return action;
}

function getUnknownTypeName(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  payload: UnknownTypePayload | undefined,
): string {
  return payload?.typeName ?? document.getText(diagnostic.range).trim();
}

function findNearestScopeStartLine(document: vscode.TextDocument, lineIdx: number): number {
  for (let i = lineIdx; i >= 0; i--) {
    const line = document.lineAt(i).text.trim();
    if (
      /^(?:Public|Private|Protected|Friend|Shared|Override|Overloads|Overridable|MustOverride|MustInherit|NotInheritable|\s)*\b(?:Class|Sub|Function|Property)\b/i.test(
        line,
      )
    ) {
      return i;
    }
  }
  return lineIdx;
}

export function addUnknownTypeDidYouMeanBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.UnknownType));
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir todos os tipos desconhecidos neste arquivo com a primeira sugestÃ£o",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  let appliedCount = 0;

  for (const match of sorted) {
    const payload = readDiagnosticPayload<UnknownTypePayload>(match, DiagnosticCodes.UnknownType);
    if (payload && payload.suggestions.length > 0) {
      edit.replace(document.uri, match.range, payload.suggestions[0]!);
      appliedCount++;
    }
  }

  if (appliedCount === 0) return;
  action.edit = edit;
  actions.push(action);
}
