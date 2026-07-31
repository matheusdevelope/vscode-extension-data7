import type * as vscode from "../platform/vscode-api";
import type { DiagnosticPayload } from "../diagnostics/diagnostic-codes";

/** Location carried by `Diagnostic.relatedInformation`, flattened for transfer. */
export interface SerializedRelatedInformation {
  readonly uri: string;
  readonly startLine: number;
  readonly startChar: number;
  readonly endLine: number;
  readonly endChar: number;
  readonly message: string;
}

export interface SerializedLintDiagnostic {
  readonly startLine: number;
  readonly startChar: number;
  readonly endLine: number;
  readonly endChar: number;
  readonly message: string;
  readonly severity: number;
  readonly code?: string | number | { readonly value: string | number };
  readonly source?: string;
  /**
   * Typed quick-fix payload. Dropping it here silently disabled every code
   * action for worker-produced diagnostics, since the actions read `data`
   * rather than re-deriving the condition from the message.
   */
  readonly data?: DiagnosticPayload;
  /** `Unnecessary` / `Deprecated`; drives the greyed-out rendering. */
  readonly tags?: readonly number[];
  readonly relatedInformation?: readonly SerializedRelatedInformation[];
}

export function serializeLintDiagnostics(
  diagnostics: readonly vscode.Diagnostic[],
): readonly SerializedLintDiagnostic[] {
  return diagnostics.map((diag) => {
    const payload = (diag as { data?: unknown }).data;
    const related = diag.relatedInformation;
    return {
      startLine: diag.range.start.line,
      startChar: diag.range.start.character,
      endLine: diag.range.end.line,
      endChar: diag.range.end.character,
      message: diag.message,
      severity: diag.severity,
      ...(diag.code !== undefined ? { code: diag.code } : {}),
      ...(diag.source !== undefined ? { source: diag.source } : {}),
      ...(payload !== undefined ? { data: payload as DiagnosticPayload } : {}),
      ...(diag.tags !== undefined ? { tags: diag.tags.map((tag) => tag as number) } : {}),
      ...(related !== undefined
        ? {
            relatedInformation: related.map((info) => ({
              uri: info.location.uri.toString(),
              startLine: info.location.range.start.line,
              startChar: info.location.range.start.character,
              endLine: info.location.range.end.line,
              endChar: info.location.range.end.character,
              message: info.message,
            })),
          }
        : {}),
    };
  });
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
    if (diag.data !== undefined) {
      (result as { data?: unknown }).data = diag.data;
    }
    if (diag.tags !== undefined) {
      result.tags = diag.tags.map((tag) => tag as vscode.DiagnosticTag);
    }
    if (diag.relatedInformation !== undefined) {
      result.relatedInformation = diag.relatedInformation.map((info) => ({
        location: new vscodeApi.Location(
          vscodeApi.Uri.parse(info.uri),
          new vscodeApi.Range(info.startLine, info.startChar, info.endLine, info.endChar),
        ),
        message: info.message,
      }));
    }
    return result;
  });
}
