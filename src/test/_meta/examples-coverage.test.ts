import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { DiagnosticsLinter } from "../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { parseExampleHeader } from "../_helpers/fixtures";
import { createMockDoc } from "../_helpers/mock-doc";

/**
 * Cross-cutting test that enforces the contract documented in:
 *
 *   - `data7_domain.mdc` § Diagnostic codes — every code in
 *     `DiagnosticCodes` must have at least one `.bas` example under
 *     `docs/exemple/diagnostics/<code>/`.
 *   - `testing.mdc` § Coverage expectations — the `@diagnostics` header
 *     declared by each example must match what the linter actually emits
 *     (drift between docs and behaviour fails CI).
 *
 * The test deliberately lives under `src/test/_meta/` (not under
 * `src/test/diagnostics/`) so it can grow over time to cover the same
 * contract for sugars and Code Actions without polluting the per-code
 * diagnostic tests.
 */

// Resolve `docs/exemple/` regardless of whether the test runs from
// `src/test/_meta/` (ts-node) or `out/test/_meta/` (compiled). Mirrors the
// dual-lookup strategy in `_helpers/fixtures.ts`.
function resolveExamplesRoot(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "..", "docs", "exemple"), // out/test/_meta → repo root
    path.resolve(__dirname, "..", "..", "..", "..", "docs", "exemple"), // src/test/_meta → repo root
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`docs/exemple/ not found. Looked in:\n  ${candidates.join("\n  ")}`);
}

const EXAMPLES_ROOT = resolveExamplesRoot();
const DIAGNOSTICS_ROOT = path.join(EXAMPLES_ROOT, "diagnostics");

function readBasFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry.toLowerCase().endsWith(".bas")) out.push(full);
  }
  return out;
}

describe("examples-coverage", () => {
  describe("diagnostic codes", () => {
    test("every DiagnosticCode has at least one example folder", () => {
      const missing: string[] = [];
      for (const code of Object.values(DiagnosticCodes)) {
        const dir = path.join(DIAGNOSTICS_ROOT, code);
        if (!fs.existsSync(dir) || readBasFiles(dir).length === 0) missing.push(code);
      }
      assert.deepEqual(
        missing,
        [],
        `Diagnostic codes without an example under docs/exemple/diagnostics/<code>/: ${missing.join(", ")}`,
      );
    });

    test("every example .bas in docs/exemple/diagnostics/ has a valid @diagnostics header", () => {
      for (const code of Object.values(DiagnosticCodes)) {
        const dir = path.join(DIAGNOSTICS_ROOT, code);
        if (!fs.existsSync(dir)) continue;
        for (const file of readBasFiles(dir)) {
          const content = fs.readFileSync(file, "utf-8");
          // parseExampleHeader throws on malformed headers — the assertion is
          // that no example throws.
          parseExampleHeader(content);
        }
      }
    });

    test("trigger.bas examples without @requires emit the declared diagnostic codes", () => {
      // Examples flagged with `@requires` depend on workspace-level setup
      // (specific modules in the private repo, custom data7.json entries, …)
      // that the in-process mock workspace cannot reproduce. Skip those —
      // they're documented for humans, validated manually.
      for (const code of Object.values(DiagnosticCodes)) {
        const dir = path.join(DIAGNOSTICS_ROOT, code);
        if (!fs.existsSync(dir)) continue;
        const triggerPath = path.join(dir, "trigger.bas");
        if (!fs.existsSync(triggerPath)) continue;

        const content = fs.readFileSync(triggerPath, "utf-8");
        const header = parseExampleHeader(content);
        if (header.requires) continue;

        const indexer = WorkspaceSymbolIndexer.getInstance();
        const uri = `file:///example-${code}.bas`;
        indexer.updateFileContent(uri, content);
        const diags = DiagnosticsLinter.runAdvancedDiagnostics(
          createMockDoc(uri, content),
          indexer,
        );
        const emittedCodes = new Set<string>(
          diags
            .map((d) =>
              typeof d.code === "string"
                ? d.code
                : typeof d.code === "object" && d.code !== null && "value" in d.code
                  ? String((d.code as { value: string | number }).value)
                  : "",
            )
            .filter((s) => s.length > 0),
        );
        const declaredCodes = new Set(header.diagnostics.map((d) => d.code));

        for (const expected of declaredCodes) {
          assert.ok(
            emittedCodes.has(expected),
            `${triggerPath}: declared @diagnostics ${expected} but linter did not emit it; ` +
              `actually emitted: [${[...emittedCodes].join(", ")}]`,
          );
        }
      }
    });
  });
});
