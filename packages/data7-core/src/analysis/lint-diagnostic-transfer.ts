import type * as vscode from "../platform/vscode-api";
export interface SerializedLintDiagnostic {
  readonly startLine: number;
  readonly startChar: number;
  readonly endLine: number;
  readonly endChar: number;
  readonly message: string;
  readonly severity: number;
  readonly code?: string | number | { readonly value: string | number };
  readonly source?: string;
}

export function serializeLintDiagnostics(
  diagnostics: readonly vscode.Diagnostic[],
): readonly SerializedLintDiagnostic[] {
  return diagnostics.map((diag) => ({
    startLine: diag.range.start.line,
    startChar: diag.range.start.character,
    endLine: diag.range.end.line,
    endChar: diag.range.end.character,
    message: diag.message,
    severity: diag.severity,
    ...(diag.code !== undefined ? { code: diag.code } : {}),
    ...(diag.source !== undefined ? { source: diag.source } : {}),
  }));
}

export function deserializeLintDiagnostics(
  diagnostics: readonly SerializedLintDiagnostic[],
  vscodeApi: typeof vscode,
): vscode.Diagnostic[] {
  return diagnostics.map((diag) => {
    const result = new vscodeApi.Diagnostic(
      new vscodeApi.Range(diag.startLine, diag.startChar, diag.endLine, diag.endChar),
      diag.message,
      diag.severity as vscode.DiagnosticSeverity,
    );
    if (diag.code !== undefined) {
      result.code = diag.code as vscode.Diagnostic["code"];
    }
    if (diag.source !== undefined) {
      result.source = diag.source;
    }
    return result;
  });
}
