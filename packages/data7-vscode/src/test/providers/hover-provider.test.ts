import "../_setup/global-hooks";
import { WorkspaceSymbolIndexer } from "@data7/core";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicHoverProvider } from "../../providers/hover-provider";

import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

describe("D7BasicHoverProvider", () => {
  describe("provideHover", () => {
    test("returns a hover when the cursor sits on a System Library type", async () => {
      const provider = new D7BasicHoverProvider();
      const doc = createMockDoc("file:///hov.bas", "Dim x As TForm\n");
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(0, 12), noopToken))) as
        | { contents: unknown }
        | undefined;
      assert.ok(hover, "hover must not be undefined for a known type");
      assert.ok(hover.contents, "hover must carry contents");
    });

    test("returns nothing when the cursor sits on whitespace", async () => {
      const provider = new D7BasicHoverProvider();
      const doc = createMockDoc("file:///hov-blank.bas", "   \n");
      const hover = await Promise.resolve(provider.provideHover(doc, pos(0, 0), noopToken));
      assert.equal(hover, undefined);
    });

    test('renders the "Não suportado" warning when the member is isUnsupported', async () => {
      // Grid.PopupMenu is currently marked `isUnsupported: true` in Grid.ts.
      const code = `Imports Forms
Namespace mod_h
   Class C
      Public Sub Run()
         Dim g As Grid
         g.PopupMenu = Nothing
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///hov_unsup.bas", code);
      const doc = createMockDoc("file:///hov_unsup.bas", code);

      const provider = new D7BasicHoverProvider();
      // Cursor on `PopupMenu`
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(5, 14), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for PopupMenu");
      const text = JSON.stringify(hover.contents);
      assert.match(
        text,
        /N[aã]o suportado/i,
        "hover content should include the unsupported warning",
      );
    });

    test("renders Add(pValue As Product) when hovering a member of TList<Product>", async () => {
      // End-to-end: the file declares `Class TList<T>` and uses
      // `Dim _products As TList<Product>`. The hover provider must
      // resolve `_products.Add` via the synthetic flat `TList_Product`
      // and show the substituted parameter type.
      const code = `Namespace mod_app
   Class TList<T>
      Public Count As Integer
      Public Sub Add(pValue As T)
      End Sub
      Public Function Get(pIndex As Integer) As T
      End Function
   End Class

   Class TUseCase
      Public Sub Run()
         Dim _products As TList<Product>
         _products.Add(Nothing)
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///hov_generics.bas";
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      // Cursor on `Add` in `_products.Add(Nothing)` — line 12 (0-based), column ~21.
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(12, 21), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;
      assert.ok(hover, "hover must not be undefined for Add on TList<Product>");
      const text = JSON.stringify(hover.contents);
      assert.match(
        text,
        /pValue\s+As\s+Product/i,
        `hover should show substituted Product type; got: ${text}`,
      );
    });

    test("renders substituted member hover for a generic template declared in another namespace file", async () => {
      const usageCode = `Imports mod_tlist

Dim _list As TTList<Integer> = New TTList<Integer>()
_list.Add(1)`;
      const templateCode = `Namespace mod_tlist
   Class TTList<T>
      Count As Integer
      Sub Add(pValue As T)
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const usageUri = "file:///teste_hover.bas";
      indexer.updateFileContent(usageUri, usageCode);
      indexer.updateFileContent("file:///mod_tlist_hover.bas", templateCode);
      const doc = createMockDoc(usageUri, usageCode);

      const provider = new D7BasicHoverProvider();
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(3, 7), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for Add on external TTList<Integer>");
      const text = JSON.stringify(hover.contents);
      assert.match(text, /pValue\s+As\s+Integer/i);
    });

    test("resolves a Property Set parameter from the AST", async () => {
      const code = `Namespace mod_hset
   Class C
      Property Name As String
         Set(pValue As String)
            pValue = pValue
         End Set
      End Property
   End Class
End Namespace`;
      const uri = "file:///hov_set_param.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(4, 13), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for Set parameter");
      assert.match(JSON.stringify(hover.contents), /pValue\s+As\s+String/i);
    });

    test("renders delegate field hover with the delegate callable signature", async () => {
      const code = `Delegate Function DelOnExecute(pItem As TObject, pIdx As Integer, pTeste As Integer) As Boolean
Class Teste
   OnExecute As DelOnExecute
End Class
Dim teste As Teste
teste.OnExecute = Nothing`;
      const uri = "file:///hov_delegate_field.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(5, 7), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for delegate field");
      const text = JSON.stringify(hover.contents);
      assert.match(text, /Function\s+OnExecute/i);
      assert.match(text, /pTeste\s+As\s+Integer/i);
      assert.match(text, /As\s+Boolean/i);
    });

    test("hovers the namespace segment instead of the final qualified member", async () => {
      const code = `Namespace mod_testes_array_primitivo
   Sub ExecutarTesteArrayPrimitivo()
   End Sub
End Namespace

mod_testes_array_primitivo.ExecutarTesteArrayPrimitivo()`;
      const uri = "file:///hov_namespace_segment.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      const hover = (await Promise.resolve(provider.provideHover(doc, pos(5, 5), noopToken))) as
        | { contents: readonly ({ value?: string } | string)[] }
        | undefined;

      assert.ok(hover, "hover must not be undefined for qualified namespace segment");
      const text = JSON.stringify(hover.contents);
      assert.match(text, /Namespace\s+mod_testes_array_primitivo/i);
      assert.doesNotMatch(text, /Sub\s+ExecutarTesteArrayPrimitivo/i);
    });

    test("does not fall back to unrelated global member when receiver member is missing", async () => {
      const code = `Namespace mod_hover_missing_member
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)

   Class TTList<T>
      Sub ForEach(pHandler As TForEachDel<T>)
      End Sub
   End Class

   Class Produto
      Function GetNome() As String
      End Function
   End Class

   Class Other
      Function Clone() As Other
      End Function
   End Class

   Dim produtos As TTList<Produto>
   produtos.ForEach(Sub(pItem As Produto)
      pItem.Clone()
   End Sub)
End Namespace`;
      const uri = "file:///hov_missing_receiver_member.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      const hover = await Promise.resolve(
        provider.provideHover(doc, positionOnToken(code, "pItem.Clone", "Clone"), noopToken),
      );

      assert.equal(hover, undefined);
    });

    test("shows concrete TTList element type for generic members like Last", async () => {
      const code = `Namespace mod_hover_tlist_last
   Class TTList<T>
      Function Last() As T
      End Function
   End Class

   Class Produto
      Sub SetNome(pValue As String)
      End Sub
   End Class

   Class Other
      Function Last() As Other
      End Function
   End Class

   Dim produtos As TTList<Produto>
   produtos.Last().SetNome("A")
End Namespace`;
      const uri = "file:///hov_tlist_last.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicHoverProvider();
      const hover = (await Promise.resolve(
        provider.provideHover(doc, positionOnToken(code, "produtos.Last", "Last"), noopToken),
      )) as { contents: readonly ({ value?: string } | string)[] } | undefined;

      assert.ok(hover, "hover must resolve Last on TTList<Produto>");
      const text = JSON.stringify(hover.contents);
      assert.match(text, /Function\s+Last\(\)\s+As\s+Produto/i);
      assert.doesNotMatch(text, /As\s+Other/i);
    });
  });
});

function positionOnToken(code: string, token: string, word: string = token): vscode.Position {
  const lines = code.split(/\r?\n/);
  const line = lines.findIndex((entry) => entry.includes(token));
  assert.notEqual(line, -1, `token "${token}" must exist in fixture`);
  const tokenColumn = (lines[line] ?? "").indexOf(token);
  const wordColumn = (lines[line] ?? "").indexOf(word, tokenColumn);
  assert.notEqual(wordColumn, -1, `word "${word}" must exist after token "${token}"`);
  return pos(line, wordColumn);
}
