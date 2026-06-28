import * as vscode from "vscode";
import { DiagnosticCodes, type ModuleNotDeclaredPayload } from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";

export function addDeclareDependencyFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload = readDiagnosticPayload<ModuleNotDeclaredPayload>(
    diagnostic,
    DiagnosticCodes.ModuleNotDeclared,
  );
  if (!payload) return;

  const action = new vscode.CodeAction(
    `Instalar e declarar módulo "${payload.moduleName}"`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;
  action.command = {
    title: action.title,
    command: "data7.installModule",
    arguments: [payload.moduleName, document.uri],
  };
  actions.push(action);
}

export function addDeclareDependencyBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const mismatches = allDiags.filter((d) =>
    hasDiagnosticCode(d, DiagnosticCodes.ModuleNotDeclared),
  );
  if (mismatches.length <= 1) return;

  const moduleNames = new Set<string>();
  for (const match of mismatches) {
    const payload = readDiagnosticPayload<ModuleNotDeclaredPayload>(
      match,
      DiagnosticCodes.ModuleNotDeclared,
    );
    if (payload?.moduleName) moduleNames.add(payload.moduleName);
  }
  if (moduleNames.size === 0) return;

  const action = new vscode.CodeAction(
    "Declarar todos os módulos não declarados em data7.json",
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
