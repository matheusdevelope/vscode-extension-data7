import "../_setup/global-hooks";
import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { performance } from "node:perf_hooks";
import { AnalysisProgram } from "../../analysis/analysis-program";
import { LanguageProcessor } from "../../analysis/language-processor";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { buildExpressionTypeMap } from "../../analysis/expression-type-map";
import { parseBasic } from "../../project/parser";
import { buildMockDocument } from "../../utils/text-edit-utils";
import * as vscode from "../../platform/vscode-api";
import { resetMockWorkspace } from "../_helpers/mock-doc";

/**
 * Cancellation used to only discard the result *after* the whole check had run,
 * so the profiler's "stale runs" counted completed work thrown away. These tests
 * pin the yield points that make an aborted check actually cheap
 * (REFACTOR-ANALYSIS-ENGINE.md §8.5).
 */
describe("cooperative cancellation", () => {
  const bigSource = (): string => {
    const methods = Array.from({ length: 120 }, (_, i) =>
      [
        `      Public Sub M${i}(pValue As Integer)`,
        `         Dim a${i} As Integer = pValue + ${i}`,
        `         Dim b${i} As String = "v" & a${i}`,
        `         Dim c${i} As Integer = a${i} * 2 + ${i}`,
        "      End Sub",
      ].join("\n"),
    ).join("\n");
    return ["Namespace mod_big", "   Class TBig", methods, "   End Class", "End Namespace"].join(
      "\n",
    );
  };

  beforeEach(() => {
    resetMockWorkspace();
    AnalysisProgram.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("buildExpressionTypeMap stops walking once the token fires", () => {
    const uri = "file:///proj/mod_big.bas";
    const source = bigSource();
    const { unit } = parseBasic(source);
    const document = buildMockDocument(vscode.Uri.parse(uri), source);
    const indexer = WorkspaceSymbolIndexer.getInstance();
    indexer.updateFileContent(uri, source);

    const started = performance.now();
    buildExpressionTypeMap(unit, document, indexer);
    const fullMs = performance.now() - started;

    LanguageProcessor.getInstance().clearCache();
    const cancelledStart = performance.now();
    buildExpressionTypeMap(unit, document, indexer, () => true);
    const cancelledMs = performance.now() - cancelledStart;

    assert.ok(
      cancelledMs <= fullMs,
      `aborted pass (${cancelledMs.toFixed(1)}ms) must not cost more than the full one (${fullMs.toFixed(1)}ms)`,
    );
  });

  test("an aborted check reports cancelled and keeps no partial result", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/mod_abort.bas";
    const source = bigSource();

    const result = program.ensureChecked(uri, source, 1, { isCancellationRequested: true });

    assert.equal(result.cancelled, true);
    assert.equal(
      program.getSnapshot(uri)?.checkResult,
      undefined,
      "a cancelled check must not be cached as the answer",
    );
  });

  test("a cancelled check does not poison the next one", () => {
    const program = AnalysisProgram.getInstance();
    const uri = "file:///proj/mod_retry.bas";
    const source = bigSource();

    program.ensureChecked(uri, source, 1, { isCancellationRequested: true });
    const good = program.ensureChecked(uri, source, 1);

    assert.equal(good.cancelled, false);
    assert.ok(program.getSnapshot(uri)?.checkResult, "the completed check must be cached");
  });
});
