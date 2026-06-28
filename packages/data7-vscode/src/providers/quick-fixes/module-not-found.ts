import * as vscode from "vscode";
import { DiagnosticCodes, type ModuleNotFoundPayload } from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addInstallModuleFix(
  actions: vscode.CodeAction[],
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<ModuleNotFoundPayload>(
    diagnostic,
    DiagnosticCodes.ModuleNotFound,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    `Instalar módulo "${payload.moduleName}" do repositório…`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.command = {
    title: action.title,
    command: "data7.installModule",
    arguments: [payload.moduleName],
  };
  actions.push(action);
}

export function addInstallModuleBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.ModuleNotFound));
  if (mismatches.length <= 1) return;

  const moduleNames = new Set<string>();
  for (const match of mismatches) {
    const payload = readDiagnosticPayload<ModuleNotFoundPayload>(
      match,
      DiagnosticCodes.ModuleNotFound,
    );
    if (payload?.moduleName) moduleNames.add(payload.moduleName);
  }
  if (moduleNames.size === 0) return;

  const action = new vscode.CodeAction(
    "Instalar todos os módulos não encontrados a partir do repositório",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.command = {
    title: action.title,
    command: "data7.installModulesBulk",
    arguments: [Array.from(moduleNames)],
  };
  actions.push(action);
}
