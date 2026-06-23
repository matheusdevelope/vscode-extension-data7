import * as vscode from "vscode";
import type { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import type { GenericTemplateInfo, GenericsPassWarning } from "../analysis/generics-analyzer";
import {
  DiagnosticCodes,
  setDiagnosticPayload,
  type ClassGenericMethodUnsupportedPayload,
  type DuplicateTemplatePayload,
  type FlatNameCollisionPayload,
  type GenericArityMismatchPayload,
  type InstantiationLimitExceededPayload,
  type UnknownTemplatePayload,
} from "./diagnostic-codes";

/** Converts generic-analysis warnings into editor diagnostics. */
export function collectGenericDiagnostics(
  warnings: readonly GenericsPassWarning[],
  lines: readonly string[],
): vscode.Diagnostic[] {
  return warnings.map((warning) => {
    const diagnostic = new vscode.Diagnostic(
      computeGenericWarningRange(warning, lines),
      formatGenericWarningMessage(warning),
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = mapGenericWarningToDiagnosticCode(warning.code);
    attachGenericWarningPayload(diagnostic, warning);
    return diagnostic;
  });
}

/** Finds generic templates provided by other files in the current workspace. */
export function collectWorkspaceGenericTemplates(
  indexer: WorkspaceSymbolIndexer,
  currentFileUri: string,
): GenericTemplateInfo[] {
  const templates: GenericTemplateInfo[] = [];
  const seen = new Set<string>();
  for (const symbol of indexer.getAllSymbols()) {
    if (symbol.fileUri === currentFileUri) continue;
    if (symbol.kind !== "class" && symbol.kind !== "delegate" && symbol.kind !== "method") continue;
    if (!symbol.genericTypeParameters || symbol.genericTypeParameters.length === 0) continue;
    const key = symbol.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({
      kind: symbol.kind,
      name: symbol.name,
      typeParams: symbol.genericTypeParameters,
      line: symbol.range.startLine,
    });
  }
  return templates;
}

function computeGenericWarningRange(
  warning: GenericsPassWarning,
  lines: readonly string[],
): vscode.Range {
  const line = warning.line ?? 0;
  const col = warning.column ?? 0;
  const lineText = lines[line] ?? "";
  const lt = lineText.indexOf("<", col);
  const gt = lt >= 0 ? lineText.indexOf(">", lt) : -1;
  return new vscode.Range(line, col, line, gt >= 0 ? gt + 1 : Math.max(col + 1, lineText.length));
}

function mapGenericWarningToDiagnosticCode(code: GenericsPassWarning["code"]): string {
  switch (code) {
    case "unknown-template":
      return DiagnosticCodes.UnknownTemplate;
    case "generic-arity-mismatch":
      return DiagnosticCodes.GenericArityMismatch;
    case "duplicate-template":
      return DiagnosticCodes.DuplicateTemplate;
    case "class-generic-method-unsupported":
      return DiagnosticCodes.ClassGenericMethodUnsupported;
    case "flat-name-collision":
      return DiagnosticCodes.FlatNameCollision;
    case "instantiation-limit-exceeded":
      return DiagnosticCodes.InstantiationLimitExceeded;
  }
}

function formatGenericWarningMessage(warning: GenericsPassWarning): string {
  switch (warning.code) {
    case "unknown-template":
      return `Generics: template '${warning.templateName ?? ""}' nÃ£o foi encontrado no contexto de generics. O Builder deixarÃ¡ a referÃªncia inalterada e o compilador surfarÃ¡ erro.`;
    case "generic-arity-mismatch":
      return `Generics: '${warning.templateName ?? ""}' espera ${String(warning.expected ?? 0)} argumento(s) de tipo, mas recebeu ${String(warning.actual ?? 0)}.`;
    case "duplicate-template":
      return `Generics: template '${warning.templateName ?? ""}' declarado mais de uma vez; a Ãºltima declaraÃ§Ã£o prevalece.`;
    case "class-generic-method-unsupported":
      return `Generics: mÃ©todo genÃ©rico '${warning.templateName ?? ""}' dentro de classe nÃ£o Ã© suportado pelo monomorphizer; a declaraÃ§Ã£o serÃ¡ removida do output do Builder.`;
    case "flat-name-collision":
      return `Generics: duas instanciaÃ§Ãµes distintas colapsam ao mesmo nome '${warning.flatName ?? ""}'. Renomeie um dos tipos para desambiguar.`;
    case "instantiation-limit-exceeded":
      return "Generics: limite de instanciaÃ§Ãµes excedido; o Builder abortou a expansÃ£o. Verifique se hÃ¡ recursÃ£o infinita em um template.";
  }
}

function attachGenericWarningPayload(
  diagnostic: vscode.Diagnostic,
  warning: GenericsPassWarning,
): void {
  switch (warning.code) {
    case "unknown-template":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.UnknownTemplate,
        templateName: warning.templateName ?? "",
      } satisfies UnknownTemplatePayload);
      return;
    case "generic-arity-mismatch":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.GenericArityMismatch,
        templateName: warning.templateName ?? "",
        expected: warning.expected ?? 0,
        actual: warning.actual ?? 0,
      } satisfies GenericArityMismatchPayload);
      return;
    case "duplicate-template":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.DuplicateTemplate,
        templateName: warning.templateName ?? "",
      } satisfies DuplicateTemplatePayload);
      return;
    case "class-generic-method-unsupported":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.ClassGenericMethodUnsupported,
        qualifiedName: warning.templateName ?? "",
      } satisfies ClassGenericMethodUnsupportedPayload);
      return;
    case "flat-name-collision":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.FlatNameCollision,
        flatName: warning.flatName ?? "",
      } satisfies FlatNameCollisionPayload);
      return;
    case "instantiation-limit-exceeded":
      setDiagnosticPayload(diagnostic, {
        code: DiagnosticCodes.InstantiationLimitExceeded,
        limit: 10_000,
      } satisfies InstantiationLimitExceededPayload);
      return;
  }
}
