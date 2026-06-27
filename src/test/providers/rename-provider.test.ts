import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
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

    test("renames a namespace, updating declaration, imports and qualified type references, while ignoring local variables with the same name", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-rename-"));
      const file1 = path.join(tmpDir, "titulos.bas");
      const file2 = path.join(tmpDir, "consumer.bas");

      // File 1: defines Namespace ControleTitulos
      const text1 = `Namespace ControleTitulos
   Class Titulo
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      
      // File 2: imports ControleTitulos, uses it qualifications, and has a local variable also named ControleTitulos
      const text2 = `Imports ControleTitulos
Namespace mod_consumer
   Class Consumer
      Public Sub Free()
         MyBase.Free()
      End Sub
      Public Sub Run()
         Dim x As ControleTitulos.Titulo
         Dim ControleTitulos As Integer = 10
         Dim y As Integer = ControleTitulos
      End Sub
   End Class
End Namespace`;

      fs.writeFileSync(file1, text1, "utf8");
      fs.writeFileSync(file2, text2, "utf8");

      const uri1 = vscode.Uri.file(file1).toString();
      const uri2 = vscode.Uri.file(file2).toString();

      indexer.updateFileContent(uri1, text1);
      indexer.updateFileContent(uri2, text2);

      const doc1 = createMockDoc(uri1, text1);
      const provider = new D7BasicRenameProvider();
      
      // Rename namespace ControleTitulos (pos 0, 10 is on the namespace declaration word "ControleTitulos")
      const edit = (await Promise.resolve(
        provider.provideRenameEdits(doc1, pos(0, 10), "NovoNome", noopToken),
      )) as unknown as { edits: { uri: { path: string }, range: { start: { line: number, character: number }, end: { line: number, character: number } } }[] };
      
      assert.ok(edit);
      
      // We expect edits:
      // 1. In titulos.bas, line 0: Namespace ControleTitulos -> NovoNome (1 edit)
      const editsInTitulos = edit.edits.filter(e => e.uri.path.toLowerCase().endsWith("titulos.bas"));
      assert.equal(editsInTitulos.length, 1);
      assert.equal(editsInTitulos[0]?.range.start.line, 0);

      // 2. In consumer.bas:
      //   - line 0: Imports ControleTitulos -> Imports NovoNome (1 edit)
      //   - line 7: Dim x As ControleTitulos.Titulo -> Dim x As NovoNome.Titulo (1 edit)
      //   - line 8: Dim ControleTitulos As Integer (should NOT be renamed!)
      //   - line 9: Dim y As Integer = ControleTitulos (should NOT be renamed!)
      const editsInConsumer = edit.edits.filter(e => e.uri.path.toLowerCase().endsWith("consumer.bas"));
      
      // Let's assert we only rename the imports and qualified type prefix
      assert.equal(editsInConsumer.length, 2);
      
      // Check lines
      const sortedConsumerEdits = editsInConsumer.slice().sort((a, b) => a.range.start.line - b.range.start.line);
      assert.equal(sortedConsumerEdits[0]?.range.start.line, 0, "Imports line should be edited");
      assert.equal(sortedConsumerEdits[1]?.range.start.line, 7, "Qualified type line should be edited");
      
      // Verify column of qualified type edit is on "ControleTitulos" part (starts at 18)
      assert.equal(sortedConsumerEdits[1]?.range.start.character, 18);
    });

    test("renames a sub-namespace in a compound path, updating compound imports and qualified references correctly", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-rename-compound-"));
      const file1 = path.join(tmpDir, "comp_helper.bas");
      const file2 = path.join(tmpDir, "comp_caller.bas");

      // File 1: defines Namespace Data7.Helpers
      const text1 = `Namespace Data7.Helpers
   Class FTP
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace`;
      
      // File 2: imports Data7.Helpers and uses qualified access Data7.Helpers.FTP
      const text2 = `Imports Data7.Helpers
Namespace mod_caller
   Class Caller
      Public Sub Run()
         Dim ftp As Data7.Helpers.FTP
         Dim Helpers As Integer = 5 ' should NOT rename!
      End Sub
   End Class
End Namespace`;

      fs.writeFileSync(file1, text1, "utf8");
      fs.writeFileSync(file2, text2, "utf8");

      const uri1 = vscode.Uri.file(file1).toString();
      const uri2 = vscode.Uri.file(file2).toString();

      indexer.updateFileContent(uri1, text1);
      indexer.updateFileContent(uri2, text2);
      
      const doc1 = createMockDoc(uri1, text1);
      const provider = new D7BasicRenameProvider();
      
      // Renomear "Helpers" para "Utils" a partir da declaração em comp_helper.bas
      // na linha 0 (onde está "Namespace Data7.Helpers"). "Helpers" começa no caractere 16
      const edit = (await Promise.resolve(
        provider.provideRenameEdits(doc1, pos(0, 16), "Utils", noopToken),
      )) as unknown as { edits: { uri: { path: string }, range: { start: { line: number, character: number }, end: { line: number, character: number } }, text: string }[] };
      
      assert.ok(edit);
      
      // Esperamos edições:
      // 1. Em comp_helper.bas, linha 0: Namespace Data7.Helpers -> Namespace Data7.Utils (1 edit, "Helpers" começa em 16)
      const editsInHelper = edit.edits.filter(e => e.uri.path.toLowerCase().endsWith("comp_helper.bas"));
      assert.equal(editsInHelper.length, 1);
      assert.equal(editsInHelper[0]?.range.start.line, 0);
      assert.equal(editsInHelper[0]?.range.start.character, 16);
      
      // 2. Em comp_caller.bas:
      //   - linha 0: Imports Data7.Helpers -> Imports Data7.Utils (1 edit, "Helpers" começa em 14)
      //   - line 4: Dim ftp As Data7.Helpers.FTP -> Dim ftp As Data7.Utils.FTP (1 edit, "Helpers" começa em 26)
      //   - line 5: Dim Helpers As Integer = 5 (should NOT rename!)
      const editsInCaller = edit.edits.filter(e => e.uri.path.toLowerCase().endsWith("comp_caller.bas"));
      assert.equal(editsInCaller.length, 2);
      
      const sortedEdits = editsInCaller.slice().sort((a, b) => a.range.start.line - b.range.start.line);
      assert.equal(sortedEdits[0]?.range.start.line, 0);
      assert.equal(sortedEdits[0]?.range.start.character, 14);
      assert.equal(sortedEdits[0]?.text, "Utils");

      assert.equal(sortedEdits[1]?.range.start.line, 4);
      assert.equal(sortedEdits[1]?.range.start.character, 26);
      assert.equal(sortedEdits[1]?.text, "Utils");
    });
  });
});

