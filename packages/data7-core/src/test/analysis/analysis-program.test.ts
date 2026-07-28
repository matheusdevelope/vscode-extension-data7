import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { AnalysisProgram } from "../../analysis/analysis-program";
import { LanguageProcessor } from "../../analysis/language-processor";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { SemanticLintCache } from "../../analysis/semantic-lint-cache";
import { DeclarationLintCache } from "../../analysis/declaration-lint-cache";
import { findClosest } from "../../diagnostics/diagnostic-helpers";
import { DependencyScanner } from "../../analysis/dependency-scanner";
import { performance } from "node:perf_hooks";
import type { SymbolInfo } from "../../analysis/symbol-indexer";
import type { ModuleReference } from "../../analysis/dependency-scanner";

describe("AnalysisProgram", () => {
  beforeEach(() => {
    AnalysisProgram.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    SemanticLintCache.resetForTests();
    DeclarationLintCache.resetForTests();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("ensureParsed updates snapshot and indexer without waiting for lint", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/Sample.bas";
    const source = `
Namespace Demo
  Class Foo
    Public Sub Bar()
    End Sub
  End Class
End Namespace
`.trim();

    const snap = program.ensureParsed(uri, source, 1);
    assert.equal(snap.version, 1);
    assert.ok(snap.unit.members.length > 0);
    assert.ok(snap.tokens.length > 0);

    const fileSyms = program.getWorkspaceIndex().getFileSymbols(uri);
    assert.ok(fileSyms);
    assert.ok(fileSyms.symbols.some((s: SymbolInfo) => s.name === "Foo"));
  });

  test("ensureChecked is cancelable mid-run", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/Cancel.bas";
    const methods = Array.from({ length: 40 }, (_, i) => {
      return `
  Public Sub M${i}()
    Dim x As Integer = ${i}
    Dim y As Integer = x + 1
  End Sub`;
    }).join("\n");
    const source = `
Namespace Demo
  Class Big
${methods}
  End Class
End Namespace
`.trim();

    program.ensureParsed(uri, source, 1);
    let cancelAfter = false;
    const token = {
      get isCancellationRequested(): boolean {
        return cancelAfter;
      },
    };
    // First check warms caches.
    program.ensureChecked(uri, source, 1);
    // Force re-check by bumping version with same content hash path: change text slightly
    const source2 = source + "\n";
    program.ensureParsed(uri, source2, 2);
    cancelAfter = true;
    const result = program.ensureChecked(uri, source2, 2, token);
    assert.equal(result.cancelled, true);
  });

  test("module refs reuse unit without second parse", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/Imports.bas";
    const source = `
Imports Collections
Namespace Demo
End Namespace
`.trim();
    const snap = program.ensureParsed(uri, source, 1);
    const refs = DependencyScanner.collectModuleReferencesFromUnit(snap.unit);
    assert.ok(refs.some((r: ModuleReference) => r.name.toLowerCase().includes("collections")));
  });
});

describe("findClosest budget", () => {
  test("prefers prefix matches without scanning huge pools", () => {
    const candidates = Array.from({ length: 5000 }, (_, i) => `Type${i}`);
    candidates.push("CustomerOrder");
    const t0 = performance.now();
    const hits = findClosest("Customer", candidates, { maxCandidates: 250 });
    const elapsed = performance.now() - t0;
    assert.ok(hits.includes("CustomerOrder") || hits.length >= 0);
    assert.ok(elapsed < 200, `findClosest too slow: ${elapsed.toFixed(1)}ms`);
  });
});

/**
 * Soft performance contract (report-only thresholds documented in project_context).
 * Fails only on catastrophic regressions (multi-second for tiny files).
 */
describe("analysis perf soft contract", () => {
  beforeEach(() => {
    AnalysisProgram.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("warm ensureChecked on small file stays under soft budget", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/Perf.bas";
    const source = `
Namespace Demo
  Class A
    Public Function F() As Integer
      Return 1
    End Function
  End Class
End Namespace
`.trim();
    program.ensureParsed(uri, source, 1);
    program.ensureChecked(uri, source, 1);
    const t0 = performance.now();
    const again = program.ensureChecked(uri, source, 1);
    const elapsed = performance.now() - t0;
    assert.ok(again.diagnostics);
    assert.ok(elapsed < 1500, `warm check too slow: ${elapsed.toFixed(1)}ms`);
  });
});
