import "../_setup/global-hooks";
import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { registerOpenDocument, resetMockWorkspace } from "../_helpers/mock-doc";

/**
 * Regression for the "I fix the error and the dependent file keeps showing it"
 * symptom: propagation read the delta of the last keystroke, so any edit after
 * an API change reset the gate before the save could act on it.
 */
describe("WorkspaceSymbolIndexer change sets", () => {
  const uri = "file:///proj/mod_api.bas";

  const withApi = (signature: string): string =>
    [
      "Namespace mod_api",
      "   Class TApi",
      `      Public Sub ${signature}`,
      "      End Sub",
      "   End Class",
      "End Namespace",
    ].join("\n");

  const withComment = (signature: string, comment: string): string =>
    [
      "Namespace mod_api",
      "   Class TApi",
      `      ' ${comment}`,
      `      Public Sub ${signature}`,
      "      End Sub",
      "   End Class",
      "End Namespace",
    ].join("\n");

  let indexer: WorkspaceSymbolIndexer;

  beforeEach(() => {
    resetMockWorkspace();
    indexer = WorkspaceSymbolIndexer.getInstance();
    indexer.__resetForTests();
    registerOpenDocument(uri, "proj/mod_api.bas");
  });

  test("keeps apiChanged set when a later edit does not touch the API", () => {
    indexer.updateFileContent(uri, withApi("Run(pValue As Integer)"));
    indexer.takeChangeSet(uri);

    indexer.updateFileContent(uri, withApi("Run(pValue As String)"));
    assert.equal(indexer.hasLastUpdateChangedAPI(uri), true);

    // Typing a comment afterwards must not clear the pending API delta.
    indexer.updateFileContent(uri, withComment("Run(pValue As String)", "nota"));
    assert.equal(indexer.hasLastUpdateChangedAPI(uri), false);

    assert.equal(
      indexer.takeChangeSet(uri).apiChanged,
      true,
      "the accumulated delta must survive non-API edits",
    );
  });

  test("takeChangeSet closes the delta so the next read is clean", () => {
    indexer.updateFileContent(uri, withApi("Run()"));
    assert.equal(indexer.takeChangeSet(uri).apiChanged, true);
    assert.equal(indexer.takeChangeSet(uri).apiChanged, false);
  });

  test("peekChangeSet does not close the delta", () => {
    indexer.updateFileContent(uri, withApi("Run()"));
    assert.equal(indexer.peekChangeSet(uri).apiChanged, true);
    assert.equal(indexer.peekChangeSet(uri).apiChanged, true);
    assert.equal(indexer.takeChangeSet(uri).apiChanged, true);
  });

  test("restoreChangeSet re-opens a delta after a failed propagation", () => {
    indexer.updateFileContent(uri, withApi("Run()"));
    const taken = indexer.takeChangeSet(uri);
    assert.equal(indexer.peekChangeSet(uri).apiChanged, false);

    indexer.restoreChangeSet(taken);
    assert.equal(indexer.peekChangeSet(uri).apiChanged, true);
  });

  test("accumulates namespaces across a rename so old importers are still reached", () => {
    indexer.updateFileContent(uri, "Namespace mod_old\nEnd Namespace");
    indexer.takeChangeSet(uri);

    indexer.updateFileContent(uri, "Namespace mod_new\nEnd Namespace");
    indexer.updateFileContent(uri, "Namespace mod_newer\nEnd Namespace");

    const changeSet = indexer.takeChangeSet(uri);
    assert.ok(changeSet.changedNamespaces.has("mod_old"), "the pre-rename name must be retained");
    assert.ok(changeSet.changedNamespaces.has("mod_new"));
    assert.ok(changeSet.changedNamespaces.has("mod_newer"));
  });

  test("a change in one file does not consume another file's delta", () => {
    const otherUri = "file:///proj/mod_other.bas";
    registerOpenDocument(otherUri, "proj/mod_other.bas");

    indexer.updateFileContent(uri, withApi("Run()"));
    indexer.updateFileContent(otherUri, "Namespace mod_other\nEnd Namespace");

    // Consuming the other file's delta must leave this one intact.
    indexer.takeChangeSet(otherUri);
    assert.equal(indexer.peekChangeSet(uri).apiChanged, true);
  });
});
