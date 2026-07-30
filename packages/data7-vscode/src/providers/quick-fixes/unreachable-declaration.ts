import * as vscode from "vscode";
import { DiagnosticCodes } from "@data7/core";
import type { UnreachableDeclarationPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addUnreachableDeclarationCommentFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnreachableDeclarationPayload>(
    diagnostic,
    DiagnosticCodes.UnreachableDeclaration,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    "Comentar bloco inalcançável",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = false;
  action.edit = buildCommentEdit(document, [payload]);
  actions.push(action);
}

export function addUnreachableDeclarationCommentBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payloads = vscode.languages
    .getDiagnostics(document.uri)
    .filter((diag) => hasDiagnosticCode(diag, DiagnosticCodes.UnreachableDeclaration))
    .map((diag) =>
      readDiagnosticPayload<UnreachableDeclarationPayload>(
        diag,
        DiagnosticCodes.UnreachableDeclaration,
      ),
    )
    .filter((payload): payload is UnreachableDeclarationPayload => payload !== undefined);
  if (payloads.length <= 1) return;

  const action = new vscode.CodeAction(
    "Comentar todos os blocos inalcançáveis neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.edit = buildCommentEdit(document, payloads);
  actions.push(action);
}

function buildCommentEdit(
  document: vscode.TextDocument,
  payloads: readonly UnreachableDeclarationPayload[],
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
