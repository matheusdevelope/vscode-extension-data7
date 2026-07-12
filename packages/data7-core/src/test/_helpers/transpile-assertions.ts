import type { SugarDiagnostic } from "../../project/transpiler-types";

/** Generic analyzer warnings that do not block array-list materialization in usage files. */
export function expectNoBlockingTranspileDiagnostics(
  diagnostics: readonly SugarDiagnostic[],
): void {
  const blocking = diagnostics.filter((diag) => diag.code !== "unknown-template");
  if (blocking.length > 0) {
    throw new Error(
      `Expected no blocking transpile diagnostics, got:\n${blocking.map((d) => JSON.stringify(d)).join("\n")}`,
    );
  }
}
