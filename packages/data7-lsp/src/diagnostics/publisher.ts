import { AnalysisProgram, DIAGNOSTIC_SOURCE } from "@data7/core";
import type { Connection, Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import type { TextDocument } from "vscode-languageserver-textdocument";

/**
 * Runs a check for `doc` and publishes the result as LSP diagnostics.
 * Stale/cancelled results publish an empty list so Problems does not keep
 * outdated entries while a newer check is in flight.
 */
export function publishDocumentDiagnostics(connection: Connection, doc: TextDocument): void {
  const program = AnalysisProgram.getInstance();
  const result = program.ensureChecked(doc.uri, doc.getText(), doc.version, undefined, "active");

  if (result.cancelled || result.stale) {
    connection.sendDiagnostics({ uri: doc.uri, diagnostics: [] });
    return;
  }

  const diagnostics: Diagnostic[] = result.diagnostics.map((diag) => {
    const severity = mapSeverity(diag.severity);
    const code =
      typeof diag.code === "string" || typeof diag.code === "number"
        ? diag.code
        : typeof diag.code === "object" && diag.code !== null && "value" in diag.code
          ? (diag.code as { value: string | number }).value
          : undefined;

    return {
      range: {
        start: {
          line: diag.range.start.line,
          character: diag.range.start.character,
        },
        end: {
          line: diag.range.end.line,
          character: diag.range.end.character,
        },
      },
      message: diag.message,
      severity,
      source: DIAGNOSTIC_SOURCE,
      code,
      data: diag.data,
      tags: diag.tags ? [...diag.tags] : undefined,
    };
  });

  connection.sendDiagnostics({ uri: doc.uri, version: doc.version, diagnostics });
}

export function clearDocumentDiagnostics(connection: Connection, uri: string): void {
  connection.sendDiagnostics({ uri, diagnostics: [] });
}

function mapSeverity(severity: number | undefined): DiagnosticSeverity {
  // vscode.DiagnosticSeverity: Error=0 … Hint=3
  // LSP DiagnosticSeverity: Error=1 … Hint=4
  switch (severity) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    default:
      return 2;
  }
}
