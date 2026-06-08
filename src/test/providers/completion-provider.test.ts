import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7BasicCompletionProvider } from "../../providers/completion-provider";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

interface MockCompletionItem {
  label: string | { label: string; detail?: string };
  detail?: string;
  tags?: number[];
}

function labelOf(item: MockCompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

describe("D7BasicCompletionProvider", () => {
  describe("isUnsupported propagation", () => {
    test("flags Grid.PopupMenu as deprecated and prefixes detail with the warning", async () => {
      const code = `Imports Forms
Namespace mod_cp
   Class C
      Public Sub Run()
         Dim g As Grid
         g.
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///cp.bas", code);
      const doc = createMockDoc("file:///cp.bas", code);

      const provider = new D7BasicCompletionProvider();
      // Cursor is positioned right after `g.` on line 5 (0-indexed).
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(5, 11), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const popup = items.find((i) => labelOf(i) === "PopupMenu");
      assert.ok(popup, "completion list should include the unsupported PopupMenu member");
      assert.ok(
        popup.tags?.includes(vscode.CompletionItemTag.Deprecated),
        `expected Deprecated tag, got: ${JSON.stringify(popup.tags)}`,
      );
      assert.match(
        popup.detail ?? "",
        /N[aã]o suportado/i,
        `expected detail to mention "Não suportado", got: ${popup.detail}`,
      );
    });

    test("does NOT flag Grid.ColCount (a supported property) as deprecated", async () => {
      const code = `Imports Forms
Namespace mod_cp2
   Class C
      Public Sub Run()
         Dim g As Grid
         g.
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent("file:///cp2.bas", code);
      const doc = createMockDoc("file:///cp2.bas", code);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(5, 11), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const colCount = items.find((i) => labelOf(i) === "ColCount");
      assert.ok(colCount, "completion list should include ColCount");
      assert.ok(
        !colCount.tags?.includes(vscode.CompletionItemTag.Deprecated),
        "ColCount must NOT carry the Deprecated tag",
      );
    });
  });

  describe("generics IntelliSense (Fase 7)", () => {
    const GENERIC_FIXTURE = `Namespace mod_app
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
         _products.
      End Sub
   End Class
End Namespace`;

    test("lists members of TList template with T substituted by Product on `_products.`", async () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///cp_generics.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      const doc = createMockDoc(uri, GENERIC_FIXTURE);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          pos(12, 20),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("Add"), `Add must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Get"), `Get must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Count"), `Count must appear; got ${labels.join(", ")}`);

      // The substituted parameter type must surface in the Add label
      // signature (the part appended to the right of the label in the
      // completion list).
      const add = items.find((i) => labelOf(i) === "Add");
      assert.ok(add, "Add completion entry expected");
      const addLabelDetail = typeof add.label === "string" ? "" : (add.label.detail ?? "");
      assert.match(
        addLabelDetail,
        /Product/,
        `Add label.detail must mention substituted Product; got: ${addLabelDetail}`,
      );
    });

    test("lists members for a generic template declared in another namespace file", async () => {
      const usageCode = `Imports mod_tlist

Dim _list As TTList<Integer> = New TTList<Integer>()
_list.`;
      const templateCode = `Namespace mod_tlist
   Class TTList<T>
      Count As Integer
      Sub Add(pValue As T)
      End Sub
      Function Get(pIndex As Integer) As T
      End Function
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const usageUri = "file:///teste.bas";
      indexer.updateFileContent(usageUri, usageCode);
      indexer.updateFileContent("file:///mod_tlist.bas", templateCode);
      const doc = createMockDoc(usageUri, usageCode);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          pos(3, 6),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("Add"), `Add must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Get"), `Get must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Count"), `Count must appear; got ${labels.join(", ")}`);

      const add = items.find((i) => labelOf(i) === "Add");
      assert.ok(add, "Add completion entry expected");
      const addLabelDetail = typeof add.label === "string" ? "" : (add.label.detail ?? "");
      assert.match(addLabelDetail, /Integer/);
    });

    test("lists members for explicit generic variable even when initializer is incompatible", async () => {
      const usageCode = `Imports mod_tlist

Dim _list As TTList<Product> = New TTList<Product>()
Dim _list2 As TTList<TObject> = _list.Clone()
_list2.`;
      const templateCode = `Namespace mod_tlist
   Class TTList<T>
      Count As Integer
      Sub Add(pValue As T)
      End Sub
      Function Clone() As TTList<T>
      End Function
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const usageUri = "file:///teste_incompatible_initializer.bas";
      indexer.updateFileContent(usageUri, usageCode);
      indexer.updateFileContent("file:///mod_tlist_incompatible.bas", templateCode);
      const doc = createMockDoc(usageUri, usageCode);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          pos(4, 7),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("Add"), `Add must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Clone"), `Clone must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Count"), `Count must appear; got ${labels.join(", ")}`);
    });
  });

  describe("AST-backed local scope", () => {
    test("lists method parameters and local variables from the parsed AST", async () => {
      const code = `Namespace mod_scope
   Class C
      Public Sub Run(pName As String)
         Dim localCount As Integer
         
      End Sub
   End Class
End Namespace`;
      const uri = "file:///cp_ast_scope.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(4, 9), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("pName"), `pName must appear; got ${labels.join(", ")}`);
      assert.ok(
        labels.includes("localCount"),
        `localCount must appear; got ${labels.join(", ")}`,
      );
    });
  });
});
