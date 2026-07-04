import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { MissingMyBaseNewPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addMissingMyBaseNewFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const mode = resolveMissingMyBaseNewAction(document, diagnostic);
  const action = new vscode.CodeAction(
    mode === "create-constructor"
      ? "Criar construtor 'Sub New()'"
      : "Adicionar chamada 'MyBase.New()'",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = false;

  const edit = new vscode.WorkspaceEdit();
  if (mode === "create-constructor") {
    const insertion = resolveConstructorInsertion(document, diagnostic);
    edit.insert(document.uri, insertion.position, insertion.text);
  } else {
    const insertion = resolveMyBaseNewInsertion(document, diagnostic);
    edit.insert(document.uri, insertion.position, insertion.text);
  }
  action.edit = edit;
  actions.push(action);
}

export function addMissingMyBaseNewBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.MissingMyBaseNew));
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir construtores deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = false;

  const edit = new vscode.WorkspaceEdit();
  // Sort descending by line to avoid offset shifts.
  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
  for (const match of sorted) {
    const insertion =
      resolveMissingMyBaseNewAction(document, match) === "create-constructor"
        ? resolveConstructorInsertion(document, match)
        : resolveMyBaseNewInsertion(document, match);
    edit.insert(document.uri, insertion.position, insertion.text);
  }
  action.edit = edit;
  actions.push(action);
}

function resolveMissingMyBaseNewAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): "create-constructor" | "insert-mybase-new" {
  const payload = readDiagnosticPayload<MissingMyBaseNewPayload>(
    diagnostic,
    DiagnosticCodes.MissingMyBaseNew,
  );
  if (payload?.action) return payload.action;

  const lineText = document.lineAt(diagnostic.range.start.line).text;
  return /\bsub\s+new\b/i.test(lineText) ? "insert-mybase-new" : "create-constructor";
}

function resolveMyBaseNewInsertion(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): { readonly position: vscode.Position; readonly text: string } {
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const indent = /^(\s*)/.exec(lineText)?.[1] ?? "";
  return {
    position: new vscode.Position(line + 1, 0),
    text: `${indent}   MyBase.New()\n`,
  };
}

function resolveConstructorInsertion(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): { readonly position: vscode.Position; readonly text: string } {
  const classLine = diagnostic.range.start.line;
  const classLineText = document.lineAt(classLine).text;
  const classIndent = /^(\s*)/.exec(classLineText)?.[1] ?? "";
  const endClassLine = findMatchingEndClassLine(document, classLine);
  const memberIndent = `${classIndent}   `;
  const bodyIndent = `${memberIndent}   `;
  return {
    position: new vscode.Position(endClassLine, 0),
    text: `${memberIndent}Sub New()\n${bodyIndent}MyBase.New()\n${memberIndent}End Sub\n\n`,
  };
}

function findMatchingEndClassLine(document: vscode.TextDocument, classLine: number): number {
  let depth = 0;
  for (let line = classLine + 1; line < document.lineCount; line++) {
    const text = document.lineAt(line).text.trim().toLowerCase();
    if (/^end\s+class\b/.test(text)) {
      if (depth === 0) return line;
      depth--;
      continue;
    }
    if (/\bclass\b/.test(text) && !/^end\s+class\b/.test(text)) {
      depth++;
    }
  }
  return document.lineCount;
}
