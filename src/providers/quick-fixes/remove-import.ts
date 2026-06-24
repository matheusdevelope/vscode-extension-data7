import * as vscode from "vscode";
import { DiagnosticCodes, type UnusedImportPayload } from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";
import { LanguageProcessor } from "../../analysis/language-processor";
import { type ImportsDeclaration } from "../../project/ast/ast";

export function addRemoveImportFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<UnusedImportPayload>(
    diagnostic,
    DiagnosticCodes.UnusedImport,
  );
  let namespaceToRemove = payload?.namespace;
  if (!namespaceToRemove) {
    try {
      const line = diagnostic.range.start.line;
      const cachedDoc = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), document.getText());
      const imp = cachedDoc.unit.members.find(
        (m): m is ImportsDeclaration =>
          m.kind === "ImportsDeclaration" &&
          m.loc !== undefined &&
          m.loc.startLine - 1 === line
      );
      if (imp) {
        namespaceToRemove = imp.target;
      }
    } catch {
      // Ignore and fallback
    }
  }
  const label = namespaceToRemove
    ? `Remover Imports "${namespaceToRemove}"`
    : "Remover esta linha";

  const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const line = diagnostic.range.start.line;
  const start = new vscode.Position(line, 0);
  const end =
    line + 1 < document.lineCount
      ? new vscode.Position(line + 1, 0)
      : document.lineAt(line).range.end;

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, new vscode.Range(start, end));
  action.edit = edit;
  actions.push(action);
}

export function addRemoveImportBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter(
    (d) =>
      hasDiagnosticCode(d, DiagnosticCodes.UnusedImport) ||
      hasDiagnosticCode(d, DiagnosticCodes.DuplicateImport),
  );
  if (mismatches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Remover todos os imports duplicados/não utilizados neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  for (const match of sorted) {
    const line = match.range.start.line;
    const start = new vscode.Position(line, 0);
    const end =
      line + 1 < document.lineCount
        ? new vscode.Position(line + 1, 0)
        : document.lineAt(line).range.end;
    edit.delete(document.uri, new vscode.Range(start, end));
  }
  action.edit = edit;
  actions.push(action);
}
