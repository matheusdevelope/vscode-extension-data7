import * as vscode from "vscode";
import {
  DiagnosticCodes,
  type UnsupportedMemberPayload,
} from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

/**
 * Offers two Quick Fixes when the linter flags an `unsupported-member`:
 *
 *  1. **Comentar esta linha** — prefixes the line with `'` so the compiler
 *     ignores the statement and the author can revisit later.
 *  2. **Suprimir warning aqui** — appends `' data7:disable-line unsupported-member`
 *     at the end of the same line. Useful when the usage is intentional (legacy)
 *     and the team has accepted the risk.
 */
export function addUnsupportedMemberFixes(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnsupportedMemberPayload>(
    diagnostic,
    DiagnosticCodes.UnsupportedMember,
  );
  const memberLabel = payload ? ` "${payload.member}"` : "";
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;

  // 1. Comment the line (prefix with `' `).
  const commentAction = new vscode.CodeAction(
    `Comentar linha (membro não suportado${memberLabel})`,
    vscode.CodeActionKind.QuickFix,
  );
  commentAction.diagnostics = [diagnostic];
  commentAction.isPreferred = true;
  {
    const indentMatch = /^(\s*)/.exec(lineText);
    const indent = indentMatch?.[1] ?? "";
    const rest = lineText.slice(indent.length);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), `${indent}' ${rest}`);
    commentAction.edit = edit;
  }
  actions.push(commentAction);

  // 2. Insert inline suppression at end of line.
  const suppressAction = new vscode.CodeAction(
    `Suprimir warning unsupported-member nesta linha`,
    vscode.CodeActionKind.QuickFix,
  );
  suppressAction.diagnostics = [diagnostic];
  {
    const insertPos = new vscode.Position(line, lineText.length);
    const trailing = lineText.endsWith(" ") ? "" : " ";
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, insertPos, `${trailing}' data7:disable-line unsupported-member`);
    suppressAction.edit = edit;
  }
  actions.push(suppressAction);
}

export function addUnsupportedMemberBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.UnsupportedMember),
  );
  if (mismatches.length <= 1) return;

  const sorted = [...mismatches].sort(
    (a, b) => b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character,
  );

  // 1. Bulk comment action.
  const commentAction = new vscode.CodeAction(
    "Comentar todas as linhas de membros não suportados neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  commentAction.diagnostics = [diagnostic];
  {
    const edit = new vscode.WorkspaceEdit();
    for (const match of sorted) {
      const line = match.range.start.line;
      const lineText = document.lineAt(line).text;
      const indentMatch = /^(\s*)/.exec(lineText);
      const indent = indentMatch?.[1] ?? "";
      const rest = lineText.slice(indent.length);
      edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), `${indent}' ${rest}`);
    }
    commentAction.edit = edit;
  }
  actions.push(commentAction);

  // 2. Bulk suppression action.
  const suppressAction = new vscode.CodeAction(
    "Suprimir avisos de membros não suportados em todas as ocorrências deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  suppressAction.diagnostics = [diagnostic];
  {
    const edit = new vscode.WorkspaceEdit();
    for (const match of sorted) {
      const line = match.range.start.line;
      const lineText = document.lineAt(line).text;
      const insertPos = new vscode.Position(line, lineText.length);
      const trailing = lineText.endsWith(" ") ? "" : " ";
      edit.insert(document.uri, insertPos, `${trailing}' data7:disable-line unsupported-member`);
    }
    suppressAction.edit = edit;
  }
  actions.push(suppressAction);
}
