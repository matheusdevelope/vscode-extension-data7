import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicRenameProvider } from "../../providers/rename-provider";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

describe("D7BasicRenameProvider", () => {
  describe("prepareRename", () => {
    test("accepts a class declaration and returns its name as placeholder", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn
   Class Greeter
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn.bas", text);

      const doc = createMockDoc("file:///rn.bas", text);
      const provider = new D7BasicRenameProvider();
      const result = provider.prepareRename(doc, pos(1, 10), noopToken) as { placeholder: string };
      assert.ok(result);
      assert.equal(result.placeholder, "Greeter");
    });

    test("rejects a local variable (renameable only for class/method/namespace/structure)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn
   Class C
      Public Sub Run()
         Dim local As Integer
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn2.bas", text);

      const doc = createMockDoc("file:///rn2.bas", text);
      const provider = new D7BasicRenameProvider();
      assert.throws(() => provider.prepareRename(doc, pos(3, 13), noopToken), /não é renomeável/i);
    });
  });

  describe("provideRenameEdits", () => {
    test("rejects new names that do not start with a letter or underscore", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn
   Class C
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn3.bas", text);

      const doc = createMockDoc("file:///rn3.bas", text);
      const provider = new D7BasicRenameProvider();
      assert.throws(
        () => provider.provideRenameEdits(doc, pos(1, 10), "123-invalid", noopToken),
        /começar com letra/i,
      );
    });

    test("emits edits for the declaration AND every usage in the active document", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn
   Class Greeter
   End Class
   Class Other
      Public Sub Run()
         Dim g As Greeter
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn4.bas", text);

      const doc = createMockDoc("file:///rn4.bas", text);
      const provider = new D7BasicRenameProvider();
      const edit = (await Promise.resolve(
        provider.provideRenameEdits(doc, pos(1, 10), "Welcomer", noopToken),
      )) as unknown as { edits: unknown[] };
      assert.ok(edit);
      assert.ok(
        edit.edits.length >= 2,
        `expected ≥ 2 edits (declaration + usage), got ${edit.edits.length}`,
      );
    });

    test("does NOT rewrite occurrences that appear inside a string literal", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn_str
   Class Greeter
   End Class
   Class Other
      Public Sub Run()
         Dim g As Greeter
         Console.WriteLine("Greeter foi salvo")
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn-str.bas", text);

      const doc = createMockDoc("file:///rn-str.bas", text);
      const provider = new D7BasicRenameProvider();
      const edit = (await Promise.resolve(
        provider.provideRenameEdits(doc, pos(1, 10), "Welcomer", noopToken),
      )) as unknown as { edits: { range?: { start?: { line: number } } }[] };

      const editsOnStringLine = edit.edits.filter((e) => e.range?.start?.line === 6);
      assert.equal(
        editsOnStringLine.length,
        0,
        `expected 0 edits on the string-literal line, got ${editsOnStringLine.length}`,
      );
    });

    test('handles embedded "" escapes inside string literals correctly', async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const text = `Namespace mod_rn_esc
   Class Greeter
   End Class
   Class Other
      Public Sub Run()
         Dim g As Greeter
         Dim s As String = "Embedded ""Greeter"" stays literal"
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///rn-esc.bas", text);

      const doc = createMockDoc("file:///rn-esc.bas", text);
      const provider = new D7BasicRenameProvider();
      const edit = (await Promise.resolve(
        provider.provideRenameEdits(doc, pos(1, 10), "Welcomer", noopToken),
      )) as unknown as { edits: { range?: { start?: { line: number } } }[] };

      const editsOnEscapeLine = edit.edits.filter((e) => e.range?.start?.line === 6);
      assert.equal(
        editsOnEscapeLine.length,
        0,
        `expected 0 edits on the line with "" escapes, got ${editsOnEscapeLine.length}`,
      );
    });
  });
});
