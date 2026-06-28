import * as vscode from "vscode";
import { LegacyDiagnosticCodes } from "@data7/core";
import type { FinallyBlockUnsupportedPayload } from "@data7/core";

import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addFinallyBlockUnsupportedFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<FinallyBlockUnsupportedPayload>(
    diagnostic,
    LegacyDiagnosticCodes.FinallyBlockUnsupported,
  );
  if (!payload) return;

  const varName = payload.catchVarName ?? "_ex";
  const label = payload.isEmptyFinally
    ? "Remover bloco Finally vazio"
    : payload.catchVarName
      ? `Encapsular bloco Catch com 'If Assigned(${varName}) Then'`
      : "Declarar variavel de excecao e encapsular bloco Catch";

  const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  applyFinallyBlockFix(edit, document, payload, varName);
  action.edit = edit;
  actions.push(action);
}

export function addFinallyBlockUnsupportedBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, LegacyDiagnosticCodes.FinallyBlockUnsupported),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir todos os blocos Try/Catch/Finally neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

  for (const match of sorted) {
    const payload = readDiagnosticPayload<FinallyBlockUnsupportedPayload>(
      match,
      LegacyDiagnosticCodes.FinallyBlockUnsupported,
    );
    if (!payload) continue;
    applyFinallyBlockFix(edit, document, payload, payload.catchVarName ?? "_ex");
  }

  action.edit = edit;
  actions.push(action);
}

function applyFinallyBlockFix(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  payload: FinallyBlockUnsupportedPayload,
  varName: string,
): void {
  if (payload.isEmptyFinally && payload.finallyLine !== undefined) {
    removeEmptyFinally(edit, document, payload);
    return;
  }

  if (!payload.catchVarName) {
    const catchLineText = document.lineAt(payload.catchLine).text;
    const newCatchLineText = catchLineText.replace(/\bCatch\b/i, `Catch ${varName} As Exception`);
    edit.replace(
      document.uri,
      new vscode.Range(payload.catchLine, 0, payload.catchLine, catchLineText.length),
      newCatchLineText,
    );
  }

  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";

  if (payload.isEmptyCatch) {
    const catchLineText = document.lineAt(payload.catchLine).text;
    const catchIndent = /^(\s*)/.exec(catchLineText)?.[1] ?? "";
    const bodyIndent = catchIndent + "   ";
    const wrappedLines = [
      `${bodyIndent}If Assigned(${varName}) Then`,
      `${bodyIndent}   ' O conteudo do tratamento de erro deve ser escrito aqui`,
      `${bodyIndent}End If`,
    ];
    edit.insert(
      document.uri,
      new vscode.Position(payload.catchLine, catchLineText.length),
      eol + wrappedLines.join(eol),
    );
  } else {
    const firstStmtLineText = document.lineAt(payload.catchBodyStartLine).text;
    const bodyIndent = /^(\s*)/.exec(firstStmtLineText)?.[1] ?? "";
    const wrappedLines: string[] = [`${bodyIndent}If Assigned(${varName}) Then`];

    for (let i = payload.catchBodyStartLine; i <= payload.catchBodyEndLine; i++) {
      const lineText = document.lineAt(i).text;
      wrappedLines.push(lineText.trim() === "" ? "" : `${bodyIndent}  ${lineText.trimStart()}`);
    }
    wrappedLines.push(`${bodyIndent}End If`);

    edit.replace(
      document.uri,
      new vscode.Range(
        new vscode.Position(payload.catchBodyStartLine, 0),
        document.lineAt(payload.catchBodyEndLine).range.end,
      ),
      wrappedLines.join(eol),
    );
  }
}

function removeEmptyFinally(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  payload: FinallyBlockUnsupportedPayload,
): void {
  const startLine = payload.finallyLine ?? 0;
  const endLine = Math.max(startLine, payload.finallyEndLine ?? startLine);
  const nextLine = endLine + 1;
  const endPosition =
    nextLine < document.lineCount
      ? new vscode.Position(nextLine, 0)
      : document.lineAt(endLine).range.end;
  edit.delete(document.uri, new vscode.Range(new vscode.Position(startLine, 0), endPosition));
}
