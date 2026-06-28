/**
 * Tests for the `data7_lint_project` MCP tool. Confirms the multi-file
 * indexer flow: a snapshot with N files seeds the detached indexer once
 * and each file is then linted with cross-file visibility.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DiagnosticsLinter } from "../../../diagnostics/diagnostics";
import { WorkspaceSymbolIndexer } from "../../../analysis/symbol-indexer";
import { createMockDoc } from "../../_helpers/mock-doc";

describe("data7_lint_project — cross-file indexing", () => {
  test("a consumer that imports a sibling module sees no missing-import", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const producer = [
      "'@Module",
      "Namespace mod_resources",
      "  Class TResourceLoader",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const consumer = [
      "Imports mod_resources",
      "Namespace mod_consumer",
      "  Class TConsumer",
      "    Sub Run()",
      "      Dim loader As TResourceLoader",
      "    End Sub",
      "  End Class",
      "End Namespace",
    ].join("\n");

    indexer.updateFileContent("file:///tmp/mod_resources.bas", producer);
    indexer.updateFileContent("file:///tmp/mod_consumer.bas", consumer);

    const consumerDoc = createMockDoc("file:///tmp/mod_consumer.bas", consumer);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(consumerDoc, indexer);
    assert.ok(!diags.some((d) => d.code === "missing-import"));
  });

  test("consumer without the Imports emits missing-import", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const producer = [
      "'@Module",
      "Namespace mod_resources",
      "  Class TResourceLoader",
      "  End Class",
      "End Namespace",
    ].join("\n");
    const consumer = [
      "Namespace mod_consumer",
      "  Class TConsumer",
      "    Sub Run()",
      "      Dim loader As TResourceLoader",
      "    End Sub",
      "  End Class",
      "End Namespace",
    ].join("\n");

    indexer.updateFileContent("file:///tmp/mod_resources.bas", producer);
    indexer.updateFileContent("file:///tmp/mod_consumer.bas", consumer);

    const consumerDoc = createMockDoc("file:///tmp/mod_consumer.bas", consumer);
    const diags = DiagnosticsLinter.runAdvancedDiagnostics(consumerDoc, indexer);
    assert.ok(diags.some((d) => d.code === "missing-import"));
  });
});
