import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicDefinitionProvider } from "../../providers/definition-provider";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

describe("D7BasicDefinitionProvider", () => {
  describe("provideDefinition", () => {
    test("navigates to a workspace class declaration when the cursor is on a referenced type", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const declText = `Namespace mod_def
   Class MyTarget
   End Class
End Namespace`;
      // Register the declaration file as "open" so isFileValid accepts it.
      createMockDoc("file:///def-decl.bas", declText);
      indexer.updateFileContent("file:///def-decl.bas", declText);

      const usageText = `Namespace mod_use
   Class Caller
      Public Sub Run()
         Dim m As MyTarget
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///def-use.bas", usageText);

      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc("file:///def-use.bas", usageText);
      const result = await Promise.resolve(provider.provideDefinition(doc, pos(3, 19), noopToken));
      assert.ok(result, "must return a definition Location for the referenced type");
    });

    test("returns nothing when the cursor is on whitespace", async () => {
      const provider = new D7BasicDefinitionProvider();
      const doc = createMockDoc("file:///def-blank.bas", "   \n");
      const result = await Promise.resolve(provider.provideDefinition(doc, pos(0, 0), noopToken));
      assert.equal(result, undefined);
    });
  });
});
