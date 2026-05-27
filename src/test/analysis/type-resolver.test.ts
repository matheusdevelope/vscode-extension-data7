import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { TypeResolver } from "../../analysis/type-resolver";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { expectMembers } from "../_helpers/assertions";

describe("TypeResolver", () => {
  describe("getVariableType", () => {
    test('resolves a local "Dim x As Type" declaration in scope', () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const mockDoc = {
        uri: { toString: () => "file:///test_auto.bas" },
        getText: () => `
Namespace my_app
   Class TTest
      Public Sub Run()
         Dim s As String
         s = "hello"
      End Sub
   End Class
End Namespace
    `,
      } as any;

      const pos = { line: 5, character: 10 } as any;
      assert.equal(TypeResolver.getVariableType("s", mockDoc, pos, indexer), "String");
    });
  });

  describe("findClassSymbol", () => {
    test("resolves a class by its simple name", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const c = TypeResolver.findClassSymbol("TStringList", indexer);
      assert.ok(c);
      assert.equal(c.name, "TStringList");
    });

    test("resolves classes by qualified names (Container.Type)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      for (const qualified of [
        "Collections.TStringList",
        "Collections.TStrings",
        "System.Classes.TPersistent",
      ]) {
        const c = TypeResolver.findClassSymbol(qualified, indexer);
        assert.ok(c, `must resolve ${qualified}`);
        const expectedSimple = qualified.split(".").pop();
        assert.equal(c.name, expectedSimple);
      }
    });
  });

  describe("getAllMembersForType", () => {
    test("returns own AND inherited members up the entire ancestor chain", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();

      // TStringList own + TStrings inherited.
      const tStringList = TypeResolver.getAllMembersForType("TStringList", indexer);
      expectMembers(tStringList, [
        "Sort",
        "Find",
        "CaseSensitive", // own
        "Add",
        "Count",
        "Text",
        "IndexOf",
        "Clear", // inherited from TStrings
      ]);

      // StringList → TStringList → TStrings (full chain).
      const stringList = TypeResolver.getAllMembersForType("StringList", indexer);
      expectMembers(stringList, ["Sort", "Find", "Add", "Count", "Text"]);
    });
  });
});
