import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { D7BasicDocumentSymbolProvider } from "../../providers/document-symbol-provider";
import { createMockDoc, noopToken } from "../_helpers/mock-doc";

describe("D7BasicDocumentSymbolProvider", () => {
  describe("provideDocumentSymbols", () => {
    test("returns a Namespace → Class → Method hierarchy reflecting the source", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const uri = "file:///ws/mod_a.bas";
      const text = `Namespace mod_a
   Class Greeter
      Public Sub Hello()
      End Sub
      Public Function World() As String
      End Function
   End Class
End Namespace`;
      indexer.updateFileContent(uri, text);

      const provider = new D7BasicDocumentSymbolProvider();
      const symbols = (await Promise.resolve(
        provider.provideDocumentSymbols(createMockDoc(uri, text), noopToken),
      )) as {
        name: string;
        kind: number;
        children: { name: string; kind: number; children: { name: string }[] }[];
      }[];

      assert.ok(Array.isArray(symbols));
      assert.equal(symbols.length, 1, "top-level must be the namespace");
      const [ns] = symbols;
      assert.ok(ns);
      assert.equal(ns.name, "mod_a");
      assert.equal(ns.kind, vscode.SymbolKind.Namespace);

      const greeter = ns.children.find((c) => c.name === "Greeter");
      assert.ok(greeter, "Greeter must be a child of the namespace");
      assert.equal(greeter.kind, vscode.SymbolKind.Class);

      const methodNames = greeter.children.map((c) => c.name).sort();
      assert.deepEqual(methodNames, ["Hello", "World"]);
    });

    test("returns an empty array for files not in the indexer cache", async () => {
      const provider = new D7BasicDocumentSymbolProvider();
      const result = await Promise.resolve(
        provider.provideDocumentSymbols(createMockDoc("file:///nope.bas", ""), noopToken),
      );
      assert.deepEqual(result, []);
    });
  });
});
