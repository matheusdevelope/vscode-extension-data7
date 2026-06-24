import * as vscode from "vscode";
import { DiagnosticCodes, type MissingImportPayload } from "../../diagnostics/diagnostic-codes";
import {
  extractNamespaceFromMessage,
  findImportInsertLine,
  hasDiagnosticCode,
  readDiagnosticPayload,
} from "../code-action-helpers";

export function addMissingImportFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<MissingImportPayload>(
    diagnostic,
    DiagnosticCodes.MissingImport,
  );
  const namespaceToImport = payload?.namespace ?? extractNamespaceFromMessage(diagnostic.message);
  if (!namespaceToImport) return;

  const action = new vscode.CodeAction(
    `Importar "${namespaceToImport}"`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  const insertLine = findImportInsertLine(document);
  edit.insert(
    document.uri,
    new vscode.Position(insertLine, 0),
    `Imports ${namespaceToImport}\r\n`,
  );
  action.edit = edit;
  actions.push(action);
}

export function addMissingImportBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.MissingImport));
  if (mismatches.length <= 1) return;

  const namespacesToImport = new Set<string>();
  for (const match of mismatches) {
    const payload = readDiagnosticPayload<MissingImportPayload>(
      match,
      DiagnosticCodes.MissingImport,
    );
    const ns = payload?.namespace ?? extractNamespaceFromMessage(match.message);
    if (ns) namespacesToImport.add(ns);
  }
  if (namespacesToImport.size === 0) return;

  const action = new vscode.CodeAction(
    "Importar todas as dependências em falta neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = Array.from(namespacesToImport).sort();
  const insertLine = findImportInsertLine(document);
  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
  const insertionText = sorted.map((ns) => `Imports ${ns}`).join(eol) + eol;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, new vscode.Position(insertLine, 0), insertionText);
  action.edit = edit;
  actions.push(action);
}
