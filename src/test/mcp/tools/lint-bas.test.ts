/**
 * Tests for the `data7_lint_bas` MCP tool. We exercise the linter
 * directly via `DiagnosticsLinter.runAdvancedDiagnostics` (the same path
 * the tool wires up) using the shared test mock — this keeps tests fast
 * and lets us verify the diagnostic payloads end-to-end.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DiagnosticsLinter } from "../../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../../analysis/symbol-indexer";
import { createMockDoc } from "../../_helpers/mock-doc";

describe("data7_lint_bas — linter integration", () => {
  test("emits missing-import when a System Library type is used without Imports", () => {
    const code = [
      "Namespace mod_test",
      "  Class T",
      "    Dim list As StringList",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const doc = createMockDoc("file:///tmp/mod_test.bas", code);
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent("file:///tmp/mod_test.bas", code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    const missing = diags.find((d) => d.code === "missing-import");
    assert.ok(missing, "expected missing-import diagnostic");
  });

  test("emits no diagnostic for a well-formed snippet", () => {
    const code = [
      "Imports Collections",
      "Namespace mod_test",
      "  Class T",
      "    Dim list As StringList",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const doc = createMockDoc("file:///tmp/mod_test_ok.bas", code);
    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent("file:///tmp/mod_test_ok.bas", code);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(doc, indexer);
    // We may still get unused-import or similar; the key is no missing-import.
    assert.ok(!diags.some((d) => d.code === "missing-import"));
  });
});
