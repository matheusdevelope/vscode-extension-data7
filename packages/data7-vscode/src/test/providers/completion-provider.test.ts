import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "@data7/core";

import { D7BasicCompletionProvider } from "../../providers/completion-provider";

import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

interface MockCompletionItem {
  label: string | { label: string; detail?: string };
  detail?: string;
  tags?: number[];
  sortText?: string;
}

function labelOf(item: MockCompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

function positionAfterLine(code: string, lineText: string): vscode.Position {
  const lines = code.split(/\r?\n/);
  const line = lines.findIndex((entry) => entry.includes(lineText));
  assert.notEqual(line, -1, `line "${lineText}" must exist in fixture`);
  return pos(line, (lines[line] ?? "").length);
}

function positionAfterToken(code: string, token: string): vscode.Position {
  const lines = code.split(/\r?\n/);
  const line = lines.findIndex((entry) => entry.includes(token));
  assert.notEqual(line, -1, `token "${token}" must exist in fixture`);
  return pos(line, (lines[line] ?? "").indexOf(token) + token.length);
}

function assertBefore(labels: readonly string[], first: string, second: string): void {
  const firstIndex = labels.indexOf(first);
  const secondIndex = labels.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} must appear in completion list`);
  assert.notEqual(secondIndex, -1, `${second} must appear in completion list`);
  assert.ok(firstIndex < secondIndex, `${first} must appear before ${second}`);
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
        provider.provideCompletionItems(doc, pos(3, 6), noopToken, {} as vscode.CompletionContext),
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

    test("lists inherited members for array-sugar TTList<T> even when usage was indexed before the template", async () => {
      const usageCode = `Imports mod_tlist
Imports mod_product

Dim _products[] As Product = [
   New Product()
]

_products.`;
      const templateCode = `Namespace mod_tlist
   Class TTComposerList
      Property Length As Integer
         Get
         End Get
      End Property
      Function ToString() As String
      End Function
   End Class

   Class TTList<T>
      Inherits TTComposerList
      Sub Push(pValue As T)
      End Sub
      Function Pop() As T
      End Function
   End Class
End Namespace`;
      const productCode = `Namespace mod_product
   Class Product
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const usageUri = "file:///principal_array_sugar_completion.bas";
      const templateUri = "file:///mod_tlist_completion.bas";
      const productUri = "file:///mod_product_completion.bas";
      indexer.updateFileContent(usageUri, usageCode);
      indexer.updateFileContent(templateUri, templateCode);
      indexer.updateFileContent(productUri, productCode);
      const doc = createMockDoc(usageUri, usageCode);
      createMockDoc(templateUri, templateCode);
      createMockDoc(productUri, productCode);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(doc, pos(7, 10), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("Push"), `Push must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Pop"), `Pop must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Length"), `Length must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("ToString"), `ToString must appear; got ${labels.join(", ")}`);

      const pop = items.find((i) => labelOf(i) === "Pop");
      assert.ok(pop, "Pop completion entry expected");
      const popLabelDetail = typeof pop.label === "string" ? "" : (pop.label.detail ?? "");
      assert.match(popLabelDetail, /Product/);
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
        provider.provideCompletionItems(doc, pos(4, 7), noopToken, {} as vscode.CompletionContext),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assert.ok(labels.includes("Add"), `Add must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Clone"), `Clone must appear; got ${labels.join(", ")}`);
      assert.ok(labels.includes("Count"), `Count must appear; got ${labels.join(", ")}`);
    });
  });

  describe("AST-backed local scope", () => {
    test("shows Private members only inside the declaring class", async () => {
      const code = `Namespace mod_private_completion
   Class Vault
      Private secret As String
      Public visible As String

      Public Sub Inside()
         Me.
      End Sub
   End Class

   Class User
      Public Sub Run()
         Dim v As Vault
         v.
      End Sub
   End Class
End Namespace`;
      const uri = "file:///cp_private_visibility.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);
      const provider = new D7BasicCompletionProvider();

      const insideItems = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          positionAfterToken(code, "Me."),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];
      const insideLabels = insideItems.map(labelOf);
      assert.ok(insideLabels.includes("secret"), "Me. inside Vault should include Private member");
      assert.ok(insideLabels.includes("visible"), "Me. inside Vault should include Public member");

      const outsideItems = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          positionAfterToken(code, "v."),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];
      const outsideLabels = outsideItems.map(labelOf);
      assert.ok(
        !outsideLabels.includes("secret"),
        "v. outside Vault must not include Private member",
      );
      assert.ok(outsideLabels.includes("visible"), "v. outside Vault should include Public member");
    });

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
      assert.ok(labels.includes("localCount"), `localCount must appear; got ${labels.join(", ")}`);
    });

    test("orders suggestions from block to global and alphabetically inside each scope", async () => {
      const code = `Namespace mod_scope_order
   Class BaseBucket
      Public BaseZulu As Integer
      Public BaseAlpha As Integer
   End Class

   Class NsBucketZulu
   End Class

   Class NsBucketAlpha
   End Class

   Class ChildBucket
      Inherits BaseBucket
      Public ClassZulu As Integer
      Public ClassAlpha As Integer

      Public Sub Run(pMethodZulu As Integer, pMethodAlpha As Integer)
         Dim methodZulu As Integer
         Dim methodAlpha As Integer
         If True Then
            Dim blockZulu As Integer
            Dim blockAlpha As Integer
         End If
      End Sub
   End Class
End Namespace

Class GlobalZulu
End Class

Class GlobalAlpha
End Class`;
      const uri = "file:///cp_scope_order.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          positionAfterLine(code, "Dim blockAlpha As Integer"),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assertBefore(labels, "blockAlpha", "blockZulu");
      assertBefore(labels, "blockZulu", "pMethodAlpha");
      assertBefore(labels, "pMethodAlpha", "pMethodZulu");
      assertBefore(labels, "pMethodZulu", "ClassAlpha");
      assertBefore(labels, "ClassAlpha", "ClassZulu");
      assertBefore(labels, "ClassZulu", "BaseAlpha");
      assertBefore(labels, "BaseAlpha", "BaseZulu");
      assertBefore(labels, "BaseZulu", "NsBucketAlpha");
      assertBefore(labels, "NsBucketAlpha", "NsBucketZulu");
      assertBefore(labels, "NsBucketZulu", "GlobalAlpha");
      assertBefore(labels, "GlobalAlpha", "GlobalZulu");
    });

    test("orders member access with class members before inherited members", async () => {
      const code = `Namespace mod_member_order
   Class BaseBucket
      Public BaseZulu As Integer
      Public BaseAlpha As Integer
   End Class

   Class ChildBucket
      Inherits BaseBucket
      Public ClassZulu As Integer
      Public ClassAlpha As Integer

      Public Sub Run()
         Me.
      End Sub
   End Class
End Namespace`;
      const uri = "file:///cp_member_order.bas";
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const provider = new D7BasicCompletionProvider();
      const items = (await Promise.resolve(
        provider.provideCompletionItems(
          doc,
          positionAfterToken(code, "Me."),
          noopToken,
          {} as vscode.CompletionContext,
        ),
      )) as unknown as MockCompletionItem[];

      const labels = items.map(labelOf);
      assertBefore(labels, "ClassAlpha", "ClassZulu");
      assertBefore(labels, "ClassZulu", "BaseAlpha");
      assertBefore(labels, "BaseAlpha", "BaseZulu");
    });
  });
});
