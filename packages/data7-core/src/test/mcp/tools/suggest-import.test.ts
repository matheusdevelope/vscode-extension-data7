/**
 * Tests for the `data7_suggest_import` MCP tool. Confirms the
 * System Library lookups produce the right namespace for known types
 * and that the workspace-augmented lookup picks up newly-declared
 * classes.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { SYSTEM_SYMBOLS } from "../../../system-library";
import { WorkspaceSymbolIndexer } from "../../../analysis/symbol-indexer";

describe("data7_suggest_import — underlying lookups", () => {
  test("StringList maps to Collections in the System Library", () => {
    const matches = SYSTEM_SYMBOLS.filter(
      (s) => s.kind === "class" && s.name === "StringList" && s.containerName === "Collections",
    );
    assert.equal(matches.length, 1);
  });

  test("TFTP maps to Net", () => {
    const matches = SYSTEM_SYMBOLS.filter(
      (s) => s.kind === "class" && s.name === "TFTP" && s.containerName === "Net",
    );
    assert.equal(matches.length, 1);
  });

  test("workspace indexer surfaces user-declared classes", () => {
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const code = [
      "'@Module",
      "Namespace mod_widgets",
      "  Class TWidget",
      "  End Class",
      "End Namespace",
    ].join("\n");
    indexer.updateFileContent("file:///tmp/mod_widgets.bas", code);

    const matches = indexer
      .getAllSymbols()
      .filter((s) => s.name === "TWidget" && s.containerName === "mod_widgets");
    assert.ok(matches.length > 0, "expected TWidget to be picked up by the indexer");
  });
});
