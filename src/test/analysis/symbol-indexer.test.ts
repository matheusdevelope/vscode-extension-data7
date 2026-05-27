import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { mockTextDocuments, registerOpenDocument, resetMockWorkspace } from "../_helpers/mock-doc";

describe("WorkspaceSymbolIndexer", () => {
  describe("validateCache", () => {
    test("keeps files that exist on disk, prunes orphan in-memory entries", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();

      // (a) Real file on disk: use this test's own source path.
      const realFileUri = "file:///" + __filename.replace(/\\/g, "/");
      indexer.updateFileContent(realFileUri, "Namespace ns\nEnd Namespace");

      // (b) Phantom URI registered as "open in editor" so it is initially valid.
      const phantomUri = "file:///dummy/non_existent_file.bas";
      registerOpenDocument(phantomUri);
      indexer.updateFileContent(phantomUri, "Namespace ns2\nEnd Namespace");

      assert.ok(indexer.getFileSymbols(realFileUri));
      assert.ok(indexer.getFileSymbols(phantomUri));

      // Close the phantom (remove it from open documents).
      resetMockWorkspace();

      indexer.validateCache();

      assert.ok(
        indexer.getFileSymbols(realFileUri),
        "a file that exists on disk must remain cached",
      );
      assert.equal(
        indexer.getFileSymbols(phantomUri),
        undefined,
        "a phantom file that was closed must be pruned",
      );
    });
  });

  describe("renameWorkspaceFolder / deleteWorkspaceFolder", () => {
    test("rename moves cached entries to the new folder URIs", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const oldFolder = "c:\\dummy_project\\src\\modules\\mod_card";
      const file1 = "c:\\dummy_project\\src\\modules\\mod_card\\form\\card.bas";
      const file2 = "c:\\dummy_project\\src\\modules\\mod_card\\helper.bas";
      const file1Uri = "file:///c%3A/dummy_project/src/modules/mod_card/form/card.bas";
      const file2Uri = "file:///c%3A/dummy_project/src/modules/mod_card/helper.bas";

      registerOpenDocument(file1Uri, file1);
      registerOpenDocument(file2Uri, file2);
      indexer.updateFileContent(file1Uri, "Namespace ns_card\nEnd Namespace");
      indexer.updateFileContent(file2Uri, "Namespace ns_helper\nEnd Namespace");

      assert.ok(indexer.getFileSymbols(file1Uri));
      assert.ok(indexer.getFileSymbols(file2Uri));

      const newFolder = "c:\\dummy_project\\src\\mod_card";
      const newFile1Uri = "file:///c%3A/dummy_project/src/mod_card/form/card.bas";
      const newFile2Uri = "file:///c%3A/dummy_project/src/mod_card/helper.bas";

      // Register the new locations as "open" so isFileValid accepts them.
      resetMockWorkspace();
      registerOpenDocument(newFile1Uri, "c:\\dummy_project\\src\\mod_card\\form\\card.bas");
      registerOpenDocument(newFile2Uri, "c:\\dummy_project\\src\\mod_card\\helper.bas");

      indexer.renameWorkspaceFolder(oldFolder, newFolder);

      assert.equal(indexer.getFileSymbols(file1Uri), undefined, "old URI must be evicted");
      assert.ok(indexer.getFileSymbols(newFile1Uri), "new URI must be present");
    });

    test("delete removes every entry under the folder prefix", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const folder = "c:\\dummy_project\\src\\mod_card";
      const uri = "file:///c%3A/dummy_project/src/mod_card/form/card.bas";

      registerOpenDocument(uri, "c:\\dummy_project\\src\\mod_card\\form\\card.bas");
      indexer.updateFileContent(uri, "Namespace ns_card\nEnd Namespace");
      assert.ok(indexer.getFileSymbols(uri));

      indexer.deleteWorkspaceFolder(folder);
      assert.equal(indexer.getFileSymbols(uri), undefined);
    });
  });

  describe("dynamic cache validation on lookup", () => {
    test("purges stale symbols whose file is neither on disk nor open in editor", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const staleUri = "file:///c%3A/dummy_project/src/stale_file_not_existing.bas";
      registerOpenDocument(staleUri, "c:\\dummy_project\\src\\stale_file_not_existing.bas");

      indexer.updateFileContent(
        staleUri,
        `
Namespace ns_stale
  Class TStaleClass
    Sub StaleMethod()
    End Sub
  End Class
End Namespace
      `,
      );

      assert.notEqual(
        indexer.getFileSymbols(staleUri),
        undefined,
        'initially cached because the file is "open"',
      );

      // Close the file.
      mockTextDocuments.length = 0;
      assert.equal(indexer.isFileValid(staleUri), false);

      const symbol = indexer.findSymbolByName("TStaleClass");
      assert.equal(symbol, undefined, "stale symbol must be filtered out");
      assert.equal(indexer.getFileSymbols(staleUri), undefined, "stale file must be purged");
    });
  });
});
