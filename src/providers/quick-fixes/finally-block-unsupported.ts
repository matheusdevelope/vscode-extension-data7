import * as vscode from "vscode";
import {
  LegacyDiagnosticCodes,
  type FinallyBlockUnsupportedPayload,
} from "../../diagnostics/diagnostic-codes";
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

  const { catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName, isEmptyCatch } = payload;
  const varName = catchVarName ?? "_ex";
  const label = catchVarName
    ? `Encapsular bloco Catch com 'If Assigned(${varName}) Then'`
    : `Declarar variável de exceção e encapsular bloco Catch`;

  const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  applyFinallyBlockFix(edit, document, catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName, isEmptyCatch, varName);
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
    "Encapsular todos os blocos Catch com 'If Assigned' neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  // Sort descending to avoid offset shifts when editing multiple ranges.
  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

  for (const match of sorted) {
    const payload = readDiagnosticPayload<FinallyBlockUnsupportedPayload>(
      match,
      LegacyDiagnosticCodes.FinallyBlockUnsupported,
    );
    if (!payload) continue;

    const { catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName, isEmptyCatch } = payload;
    const varName = catchVarName ?? "_ex";
    applyFinallyBlockFix(edit, document, catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName, isEmptyCatch, varName);
  }

  action.edit = edit;
  actions.push(action);
}

// ---------------------------------------------------------------------------
// Internal helper — shared between single and bulk fix
// ---------------------------------------------------------------------------

function applyFinallyBlockFix(
  edit: vscode.WorkspaceEdit,
  document: vscode.TextDocument,
  catchLine: number,
  catchBodyStartLine: number,
  catchBodyEndLine: number,
  catchVarName: string | undefined,
  isEmptyCatch: boolean | undefined,
  varName: string,
): void {
  if (!catchVarName) {
    const catchLineText = document.lineAt(catchLine).text;
    const newCatchLineText = catchLineText.replace(/\bCatch\b/i, `Catch ${varName} As Exception`);
    edit.replace(
      document.uri,
      new vscode.Range(catchLine, 0, catchLine, catchLineText.length),
      newCatchLineText,
    );
  }

  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";

  if (isEmptyCatch) {
    const catchLineText = document.lineAt(catchLine).text;
    const catchIndent = /^(\s*)/.exec(catchLineText)?.[1] ?? "";
    const bodyIndent = catchIndent + "   ";
    const wrappedLines = [
      `${bodyIndent}If Assigned(${varName}) Then`,
      `${bodyIndent}   ' O conteúdo do tratamento de erro deve ser escrito aqui`,
      `${bodyIndent}End If`,
    ];
    edit.insert(
      document.uri,
      new vscode.Position(catchLine, catchLineText.length),
      eol + wrappedLines.join(eol),
    );
  } else {
    const firstStmtLineText = document.lineAt(catchBodyStartLine).text;
    const bodyIndent = /^(\s*)/.exec(firstStmtLineText)?.[1] ?? "";
    const wrappedLines: string[] = [`${bodyIndent}If Assigned(${varName}) Then`];

    for (let i = catchBodyStartLine; i <= catchBodyEndLine; i++) {
      const lineText = document.lineAt(i).text;
      wrappedLines.push(
        lineText.trim() === "" ? "" : `${bodyIndent}  ${lineText.trimStart()}`,
      );
    }
    wrappedLines.push(`${bodyIndent}End If`);

    edit.replace(
      document.uri,
      new vscode.Range(
        new vscode.Position(catchBodyStartLine, 0),
        document.lineAt(catchBodyEndLine).range.end,
      ),
      wrappedLines.join(eol),
    );
  }
}
