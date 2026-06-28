import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicReferenceProvider } from "../../providers/reference-provider";
import { createMockDoc, noopToken, pos, refContext } from "../_helpers/mock-doc";

describe("D7BasicReferenceProvider", () => {
  describe("provideReferences", () => {
    test("returns every whole-word occurrence in the active document", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_ref
   Class Greeter
      Public Sub Hello()
         Dim greeting As String
         greeting = "hi"
         Dim alsoGreeting As String
         alsoGreeting = greeting
      End Sub
   End Class
End Namespace`;
      const uri = "file:///ws/mod_ref.bas";
      indexer.updateFileContent(uri, text);

      const doc = createMockDoc(uri, text);
      const provider = new D7BasicReferenceProvider();
      // Cursor on `greeting` (line 3, col 13).
      const locations = (await Promise.resolve(
        provider.provideReferences(doc, pos(3, 13), refContext(true), noopToken),
      )) as unknown[];

      // Expected occurrences of `greeting`: line 3 (Dim), line 4 (assignment), line 6 (read).
      assert.ok(
        locations.length >= 3,
        `expected ≥ 3 occurrences of "greeting", got ${locations.length}`,
      );
    });

    test("returns an empty array when the cursor is not on a word", async () => {
      const provider = new D7BasicReferenceProvider();
      const doc = createMockDoc("file:///blank.bas", "   \n");
      const locations = (await Promise.resolve(
        provider.provideReferences(doc, pos(0, 0), refContext(true), noopToken),
      )) as unknown[];
      assert.deepEqual(locations, []);
    });

    test("filters out the declaration when includeDeclaration is false", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_refdec
   Class Greeter
   End Class
   Class Other
      Public Sub Run()
         Dim g As Greeter
      End Sub
   End Class
End Namespace`;
      const uri = "file:///refdec.bas";
      indexer.updateFileContent(uri, text);

      const doc = createMockDoc(uri, text);
      const provider = new D7BasicReferenceProvider();
      const withDecl = (await Promise.resolve(
        provider.provideReferences(doc, pos(5, 19), refContext(true), noopToken),
      )) as unknown[];
      const withoutDecl = (await Promise.resolve(
        provider.provideReferences(doc, pos(5, 19), refContext(false), noopToken),
      )) as unknown[];

      assert.ok(
        withDecl.length >= 2,
        `expected at least 2 locations (declaration + usage), got ${withDecl.length}`,
      );
      assert.equal(
        withoutDecl.length,
        withDecl.length - 1,
        `excluding the declaration must drop exactly one location ` +
          `(got ${withoutDecl.length}/${withDecl.length})`,
      );
    });
  });
});
