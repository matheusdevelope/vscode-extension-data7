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

    test('binds the loop variable from "For Each x As Type In ..." into the enclosing scope', () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const mockDoc = {
        uri: { toString: () => "file:///foreach_scope.bas" },
        getText: () => `
Namespace my_app
   Class TTest
      Public Sub Run()
         Dim list As StringList
         For Each item As String In list
            item.Length()
         Next
      End Sub
   End Class
End Namespace
    `,
      } as any;

      // Cursor on the body line `item.Length()` — `item` must resolve to "String".
      const pos = { line: 6, character: 12 } as any;
      assert.equal(TypeResolver.getVariableType("item", mockDoc, pos, indexer), "String");
    });

    test('infers type from "Dim x = New T(...)" when "As" is omitted', () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const mockDoc = {
        uri: { toString: () => "file:///new_expr.bas" },
        getText: () => `
Namespace my_app
   Class TTest
      Public Sub Run()
         Dim list = New StringList()
      End Sub
   End Class
End Namespace
    `,
      } as any;

      const pos = { line: 5, character: 10 } as any;
      assert.equal(TypeResolver.getVariableType("list", mockDoc, pos, indexer), "StringList");
    });

    test('infers type from "Dim x = me.Method()" using the enclosing class', () => {
      // Lazy import to avoid pulling vscode mock into the top-level imports.
      const { createMockDoc } = require("../_helpers/mock-doc") as {
        createMockDoc: (uri: string, text: string) => any;
      };
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_app
   Class TFactory
      Public Function MakeList() As StringList
      End Function
      Public Sub Run()
         Dim list = me.MakeList()
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///inference.bas", code);
      const mockDoc = createMockDoc("file:///inference.bas", code);

      const pos = { line: 5, character: 10 } as any;
      assert.equal(TypeResolver.getVariableType("list", mockDoc, pos, indexer), "StringList");
    });

    test('falls back to "Variant" when "For Each x In ..." omits the explicit type', () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const mockDoc = {
        uri: { toString: () => "file:///foreach_implicit.bas" },
        getText: () => `
Namespace my_app
   Class TTest
      Public Sub Run()
         Dim list As StringList
         For Each item In list
            item.Length()
         Next
      End Sub
   End Class
End Namespace
    `,
      } as any;

      const pos = { line: 6, character: 12 } as any;
      assert.equal(TypeResolver.getVariableType("item", mockDoc, pos, indexer), "Variant");
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

    test("auto-roots workspace classes without an Inherits clause at TObject", () => {
      // Lazy import to mirror the pattern used by the inference test below
      // (avoids pulling the vscode mock into module-level imports).
      const { createMockDoc } = require("../_helpers/mock-doc") as {
        createMockDoc: (uri: string, text: string) => unknown;
      };
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_card
   Class TCardController
      Public foo As String
   End Class
End Namespace`;
      // Register so `WorkspaceSymbolIndexer.isFileValid` keeps the symbols.
      createMockDoc("file:///auto_tobject.bas", code);
      indexer.updateFileContent("file:///auto_tobject.bas", code);

      // `Free`/`Create`/`Destroy` come from the system-library TObject; a
      // user class that omits `Inherits` must still expose them through
      // the resolver's implicit-TObject rule.
      const members = TypeResolver.getAllMembersForType("TCardController", indexer);
      expectMembers(members, ["Free", "Create", "Destroy"]);
    });
  });

  describe("resolveParent", () => {
    test("returns the explicit inheritsFrom when present", () => {
      assert.equal(
        TypeResolver.resolveParent({
          name: "TStringList",
          kind: "class",
          type: "TStringList",
          isShared: false,
          isPrivate: false,
          range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
          fileUri: "system://library",
          containerName: "Collections",
          inheritsFrom: "TStrings",
        }),
        "TStrings",
      );
    });

    test("auto-roots workspace classes without Inherits at TObject", () => {
      assert.equal(
        TypeResolver.resolveParent({
          name: "TUserClass",
          kind: "class",
          type: "TUserClass",
          isShared: false,
          isPrivate: false,
          range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
          fileUri: "file:///workspace/src/my.bas",
        }),
        "TObject",
      );
    });

    test("does NOT auto-root system-library symbols (primitives / enums / interfaces)", () => {
      assert.equal(
        TypeResolver.resolveParent({
          name: "TAlign",
          kind: "class",
          type: "TAlign",
          isShared: false,
          isPrivate: false,
          range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
          fileUri: "system://library",
          containerName: "Forms",
        }),
        undefined,
      );
    });

    test("returns undefined for TObject itself to stop the walk at the root", () => {
      assert.equal(
        TypeResolver.resolveParent({
          name: "TObject",
          kind: "class",
          type: "TObject",
          isShared: false,
          isPrivate: false,
          range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
          fileUri: "file:///workspace/src/tobject.bas",
        }),
        undefined,
      );
    });
  });

  describe("inferExpressionType — F1 literals & chains", () => {
    const mkDoc = (text: string): any => ({
      uri: { toString: () => "file:///infer_f1.bas" },
      getText: () => text,
    });

    test("infers String from a quoted literal RHS", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType('"abc"', doc, 0, indexer), "String");
    });

    test("infers Integer from a decimal literal RHS", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType("42", doc, 0, indexer), "Integer");
    });

    test("infers Double from a floating-point literal RHS", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType("3.14", doc, 0, indexer), "Double");
    });

    test("infers Boolean from True/False", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType("True", doc, 0, indexer), "Boolean");
      assert.equal(TypeResolver.inferExpressionType("False", doc, 0, indexer), "Boolean");
    });

    test("infers the target type from CType(expr, T)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(
        TypeResolver.inferExpressionType("CType(MyBase.Take(0), CardRecord)", doc, 0, indexer),
        "CardRecord",
      );
    });

    test('infers String from an interpolated literal $"..."', () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType('$"olá, {nome}"', doc, 0, indexer), "String");
    });

    test("strips trailing inline comments before inferring", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(
        TypeResolver.inferExpressionType("42  ' meaning of life", doc, 0, indexer),
        "Integer",
      );
    });

    test("infers common type from ternary when both branches agree", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType('cond ? "a" : "b"', doc, 0, indexer), "String");
    });

    test("falls back to Variant when ternary branches disagree", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const doc = mkDoc("");
      assert.equal(TypeResolver.inferExpressionType('cond ? "a" : 1', doc, 0, indexer), "Variant");
    });

    test("walks a multi-segment chain via System Library members", () => {
      const { createMockDoc } = require("../_helpers/mock-doc") as {
        createMockDoc: (uri: string, text: string) => any;
      };
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const code = `Namespace mod_app
   Imports Collections
   Class TTest
      Public Sub Run()
         Dim list As StringList
         Dim len = list.Strings(0)
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent("file:///chain_infer.bas", code);
      const doc = createMockDoc("file:///chain_infer.bas", code);

      assert.equal(TypeResolver.inferExpressionType("list.Strings(0)", doc, 5, indexer), "String");
    });
  });

  describe("generics IntelliSense (Fase 7)", () => {
    const { createMockDoc } = require("../_helpers/mock-doc") as {
      createMockDoc: (uri: string, text: string) => any;
    };

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
         _products.Add(Nothing)
      End Sub
   End Class
End Namespace`;

    test("findMember resolves Add(pValue As Product) on TList<Product>", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_hover.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      createMockDoc(uri, GENERIC_FIXTURE);

      const add = TypeResolver.findMember("TList<Product>", "Add", indexer);
      assert.ok(add, "Add must be discoverable via TList<Product>");
      assert.equal(add.kind, "method");
      assert.equal(add.parameters?.[0]?.type, "Product");
    });

    test("findMember resolves Get(): Product on TList<Product> (substituted return)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_hover_get.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      createMockDoc(uri, GENERIC_FIXTURE);

      const get = TypeResolver.findMember("TList<Product>", "Get", indexer);
      assert.ok(get, "Get must be discoverable");
      assert.equal(get.type, "Product");
    });

    test("findMember preserves non-generic field types (Count: Integer)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_hover_count.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      createMockDoc(uri, GENERIC_FIXTURE);

      const count = TypeResolver.findMember("TList<Product>", "Count", indexer);
      assert.ok(count, "Count must be discoverable");
      assert.equal(count.type, "Integer");
    });

    test("getVariableType captures the generic type annotation verbatim", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_var.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      const doc = createMockDoc(uri, GENERIC_FIXTURE);

      const pos = { line: 11, character: 20 } as any;
      assert.equal(TypeResolver.getVariableType("_products", doc, pos, indexer), "TList<Product>");
    });

    test("findClassSymbol normalises TList<Product> to the flat TList_Product", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_class.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      createMockDoc(uri, GENERIC_FIXTURE);

      const sym = TypeResolver.findClassSymbol("TList<Product>", indexer);
      assert.ok(sym, "Synthetic flat class TList_Product must be visible");
      assert.equal(sym.name, "TList_Product");
    });

    const NESTED_FIXTURE = `Namespace mod_app
   Class TList<T>
      Public Count As Integer
      Public Sub Add(pValue As T)
      End Sub
   End Class

   Class TUseCase
      Public Sub Run()
         Dim _matrix As TList<TList<Integer>>
      End Sub
   End Class
End Namespace`;

    test("findClassSymbol flattens nested generics (TList<TList<Integer>> -> TList_TList_Integer)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_nested.bas";
      indexer.updateFileContent(uri, NESTED_FIXTURE);
      createMockDoc(uri, NESTED_FIXTURE);

      const outer = TypeResolver.findClassSymbol("TList<TList<Integer>>", indexer);
      assert.ok(outer, "outer TList_TList_Integer must be visible");
      assert.equal(outer.name, "TList_TList_Integer");

      const inner = TypeResolver.findClassSymbol("TList<Integer>", indexer);
      assert.ok(inner, "inner TList_Integer must also be visible");
      assert.equal(inner.name, "TList_Integer");
    });

    test("findMember on nested TList<TList<Integer>> resolves Add(pValue As TList_Integer)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_nested_member.bas";
      indexer.updateFileContent(uri, NESTED_FIXTURE);
      createMockDoc(uri, NESTED_FIXTURE);

      const add = TypeResolver.findMember("TList<TList<Integer>>", "Add", indexer);
      assert.ok(add, "Add must be discoverable on the outer flat class");
      assert.equal(add.parameters?.[0]?.type, "TList_Integer");
    });

    test("indexer does not register phantom instantiations from comments or strings", () => {
      const FIXTURE = `Namespace mod_app
   Class TList<T>
      Public Sub Add(pValue As T)
      End Sub
   End Class

   Class TUseCase
      ' This comment mentions TList<Phantom>.
      Public Sub Run()
         Dim _msg As String = "TList<AlsoPhantom>"
         Dim _real As TList<Product>
      End Sub
   End Class
End Namespace`;
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_phantom.bas";
      indexer.updateFileContent(uri, FIXTURE);
      createMockDoc(uri, FIXTURE);

      assert.ok(TypeResolver.findClassSymbol("TList<Product>", indexer), "real usage indexed");
      assert.equal(
        TypeResolver.findClassSymbol("TList<Phantom>", indexer),
        undefined,
        "comment-mentioned TList<Phantom> must NOT be indexed",
      );
      assert.equal(
        TypeResolver.findClassSymbol("TList<AlsoPhantom>", indexer),
        undefined,
        "string-literal TList<AlsoPhantom> must NOT be indexed",
      );
    });

    test("synthetic flat class inherits the template's namespace as containerName", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generics_container.bas";
      indexer.updateFileContent(uri, GENERIC_FIXTURE);
      createMockDoc(uri, GENERIC_FIXTURE);

      const sym = TypeResolver.findClassSymbol("TList<Product>", indexer);
      assert.ok(sym);
      assert.equal(
        sym.containerName,
        "mod_app",
        "synthetic class should sit in the same namespace as TList<T>",
      );
    });

    test("resolves generic parameter type to its constraint inside class scope", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generic_scope_test.bas";
      const code = `Namespace mod_app
   Class BaseItem
      Public Sub DoSomething()
      End Sub
   End Class

   Class MyCollection<T As BaseItem>
      Private item As T
      Public Sub Execute()
         Dim localItem As T
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const pos = { line: 9, character: 15 } as any;

      assert.equal(TypeResolver.getVariableType("localItem", doc, pos, indexer), "BaseItem");

      assert.equal(TypeResolver.getVariableType("item", doc, pos, indexer), "BaseItem");
    });

    test("resolves generic parameter to TObject if no constraint specified", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generic_no_constraint_test.bas";
      const code = `Namespace mod_app
   Class MyCollection<T>
      Private item As T
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const pos = { line: 3, character: 15 } as any;
      assert.equal(TypeResolver.getVariableType("item", doc, pos, indexer), "TObject");
    });

    test("resolves generic parameter constraints in nested type arguments (TList<T> -> TList<BaseItem>)", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generic_nested_constraint_test.bas";
      const code = `Namespace mod_app
   Class BaseItem
   End Class
   Class TList<T>
   End Class
   Class MyCollection<T As BaseItem>
      Private list As TList<T>
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const pos = { line: 6, character: 15 } as any;
      assert.equal(TypeResolver.getVariableType("list", doc, pos, indexer), "TList<BaseItem>");
    });

    test("resolves method-level generic parameter constraints over class-level", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      indexer.__resetForTests();
      const uri = "file:///generic_method_constraint_test.bas";
      const code = `Namespace mod_app
   Class BaseItem
   End Class
   Class SpecificItem
   End Class
   Class MyCollection<T As BaseItem>
      Public Sub Run<T As SpecificItem>()
         Dim item As T
      End Sub
   End Class
End Namespace`;
      indexer.updateFileContent(uri, code);
      const doc = createMockDoc(uri, code);

      const pos = { line: 7, character: 15 } as any;
      assert.equal(TypeResolver.getVariableType("item", doc, pos, indexer), "SpecificItem");
    });
  });
});
