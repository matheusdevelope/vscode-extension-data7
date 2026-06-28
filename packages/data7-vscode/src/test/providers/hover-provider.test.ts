import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { D7BasicHoverProvider } from "../../providers/hover-provider";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
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
  });
});
