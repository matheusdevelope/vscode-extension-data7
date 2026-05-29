import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { analyzeGenericsPass, flatNameOf, runGenericsPass } from "../../project/generics-pass";
import { loadExample } from "../_helpers/fixtures";

describe("flatNameOf", () => {
  test("returns the base name verbatim when no type arguments", () => {
    assert.equal(flatNameOf("TList", []), "TList");
  });

  test("produces TList_Product for a single class type arg", () => {
    assert.equal(flatNameOf("TList", ["Product"]), "TList_Product");
  });

  test("produces TList_Integer for a primitive type arg", () => {
    assert.equal(flatNameOf("TList", ["Integer"]), "TList_Integer");
  });

  test("produces Map_String_Product for two type args", () => {
    assert.equal(flatNameOf("Map", ["String", "Product"]), "Map_String_Product");
  });

  test("flattens dots inside qualified type names", () => {
    assert.equal(flatNameOf("Box", ["Forms.TForm"]), "Box_Forms_TForm");
  });
});

describe("runGenericsPass", () => {
  test("returns the input unchanged when no generic declarations are present", () => {
    const code = "Class Foo\n   Public x As Integer\nEnd Class\n";
    const r = runGenericsPass(code);
    assert.equal(r.code, code);
    assert.deepEqual(r.flatNames, []);
  });

  test("monomorphises a simple TList<Product> usage", () => {
    const code = [
      "Class TList<T>",
      "   Public Count As Integer",
      "   Function Add(pValue As T) As Integer",
      "      Return 0",
      "   End Function",
      "End Class",
      "",
      "Dim _products As TList<Product>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TList_Product"));
    assert.match(r.code, /Class TList_Product/);
    assert.match(r.code, /pValue As Product/);
    assert.match(r.code, /Dim _products As TList_Product/);
    // The original generic declaration must be GONE from the output.
    assert.doesNotMatch(r.code, /Class TList<T>/);
  });

  test("monomorphises a generic delegate", () => {
    const code = [
      "Delegate Function Pred<T>(pValue As T) As Boolean",
      "",
      "Dim handler As Pred<Product>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("Pred_Product"));
    assert.match(r.code, /Delegate Function Pred_Product\(pValue As Product\)/);
    assert.match(r.code, /Dim handler As Pred_Product/);
  });

  test("monomorphises multiple instantiations of the same template", () => {
    const code = [
      "Class TList<T>",
      "   Public Count As Integer",
      "End Class",
      "",
      "Dim a As TList<Product>",
      "Dim b As TList<Integer>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TList_Product"));
    assert.ok(r.flatNames.includes("TList_Integer"));
    assert.match(r.code, /Class TList_Product/);
    assert.match(r.code, /Class TList_Integer/);
  });

  test("handles nested generics TList<TList<Integer>>", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<TList<Integer>>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TList_Integer"));
    assert.ok(r.flatNames.includes("TList_TList_Integer"));
    assert.match(r.code, /Class TList_TList_Integer/);
    assert.match(r.code, /Class TList_Integer/);
  });

  test("strips `As <constraint>` from type parameter declarations", () => {
    const code = [
      "Class TList<T As BaseEnum>",
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<CardAdm>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TList_CardAdm"));
    assert.match(r.code, /Class TList_CardAdm/);
    assert.match(r.code, /Public x As CardAdm/);
  });

  test("warnings: emits unknown-template when usage references an undeclared name", () => {
    const code = "Dim _x As TList<Product>";
    const r = runGenericsPass(code);
    // No templates declared -> no warnings (early return).
    assert.equal(r.warnings.length, 0);

    // With another template declared but `TList` still missing:
    const code2 = [
      "Class Box<T>",
      "   Public x As T",
      "End Class",
      "",
      "Dim _x As TList<Product>",
    ].join("\n");
    const r2 = runGenericsPass(code2);
    assert.ok(
      r2.warnings.some((w) => w.code === "unknown-template" && w.templateName === "TList"),
      `expected unknown-template warning for TList; got: ${JSON.stringify(r2.warnings)}`,
    );
  });

  test("warnings: emits generic-arity-mismatch when usage supplies wrong count", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<Product, Customer>",
    ].join("\n");
    const r = runGenericsPass(code);
    assert.ok(
      r.warnings.some(
        (w) =>
          w.code === "generic-arity-mismatch" &&
          w.templateName === "TList" &&
          w.expected === 1 &&
          w.actual === 2,
      ),
      `expected generic-arity-mismatch warning; got: ${JSON.stringify(r.warnings)}`,
    );
  });

  test("warnings: emits duplicate-template when two templates share the same name", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class TList<U>",
      "   Public y As U",
      "End Class",
    ].join("\n");
    const r = runGenericsPass(code);
    assert.ok(
      r.warnings.some((w) => w.code === "duplicate-template" && w.templateName === "TList"),
      `expected duplicate-template warning; got: ${JSON.stringify(r.warnings)}`,
    );
  });

  test("Bug 1 regression: a local variable named after the type param is NOT rewritten", () => {
    // The pre-tokenizer pass would rewrite every textual `\bT\b` in the
    // body, including a local `Dim T = 42`. The tokenizer-aware
    // substitution only rewrites type-reference positions (after As/New/
    // Inherits/Implements and inside balanced `<...>`), so a local var
    // happening to be named `T` survives unchanged.
    const code = [
      "Class TList<T>",
      "   Public Sub Foo()",
      "      Dim T = 42",
      "      T = T + 1",
      "      Items.Add(T)",
      "   End Sub",
      "End Class",
      "",
      "Dim a As TList<Product>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TList_Product"));
    // The local `T` (declaration, assignment, argument) must be preserved.
    assert.match(r.code, /Dim T = 42/);
    assert.match(r.code, /\bT = T \+ 1\b/);
    assert.match(r.code, /Items\.Add\(T\)/);
    // The class header is still flattened.
    assert.match(r.code, /Class TList_Product/);
    // Sanity: no rogue rewrite of the local into `Product`.
    assert.doesNotMatch(r.code, /Dim Product = 42/);
  });

  test("Bug 1 regression: a comment or string containing `T` is NOT rewritten", () => {
    const code = [
      "Class TList<T>",
      "   ' Stores T values internally",
      `   Public Caption As String = "T is the type"`,
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<Product>",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.match(r.code, /' Stores T values internally/);
    assert.match(r.code, /"T is the type"/);
    // The type reference itself IS substituted.
    assert.match(r.code, /Public x As Product/);
  });

  test("Bug 1 regression: a member access named T is NOT rewritten", () => {
    const code = [
      "Class TList<T>",
      "   Public Sub Foo(obj As Object)",
      "      obj.T = 0",
      "   End Sub",
      "End Class",
      "",
      "Dim a As TList<Product>",
    ].join("\n");

    const r = runGenericsPass(code);
    // `obj.T` must not become `obj.Product`.
    assert.match(r.code, /obj\.T = 0/);
    assert.doesNotMatch(r.code, /obj\.Product = 0/);
  });

  test("monomorphises a free generic Sub at namespace level", () => {
    const code = [
      "Sub Map<T>(pValue As T)",
      "   Items.Add(pValue)",
      "End Sub",
      "",
      "Map<Product>(item)",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("Map_Product"));
    assert.match(r.code, /Sub Map_Product\(pValue As Product\)/);
    assert.match(r.code, /Map_Product\(item\)/);
    // The original generic header must be gone.
    assert.doesNotMatch(r.code, /Sub Map<T>/);
  });

  test("monomorphises a free generic Function at namespace level", () => {
    const code = [
      "Public Function Wrap<T>(pValue As T) As T",
      "   Return pValue",
      "End Function",
      "",
      "Dim r = Wrap<Integer>(42)",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("Wrap_Integer"));
    assert.match(r.code, /Function Wrap_Integer\(pValue As Integer\) As Integer/);
    assert.match(r.code, /Wrap_Integer\(42\)/);
  });

  test("rewrites a method invocation with type arguments obj.Foo<X>(args)", () => {
    const code = [
      "Sub Foo<T>(pValue As T)",
      "   Return",
      "End Sub",
      "",
      "obj.Foo<Product>(item)",
    ].join("\n");

    const r = runGenericsPass(code);
    // The invocation is rewritten to the flat name.
    assert.match(r.code, /obj\.Foo_Product\(item\)/);
    assert.ok(r.flatNames.includes("Foo_Product"));
  });

  test("emits class-generic-method-unsupported for a generic method inside a class", () => {
    const code = [
      "Class Helper",
      "   Public Sub Process<T>(pItem As T)",
      "      Return",
      "   End Sub",
      "End Class",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(
      r.warnings.some(
        (w) => w.code === "class-generic-method-unsupported" && w.templateName === "Process",
      ),
      `expected class-generic-method-unsupported; got: ${JSON.stringify(r.warnings)}`,
    );
  });

  test("warnings: does not emit on a well-formed input", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<Product>",
    ].join("\n");
    const r = runGenericsPass(code);
    assert.equal(r.warnings.length, 0, `unexpected warnings: ${JSON.stringify(r.warnings)}`);
  });
});

describe("analyzeGenericsPass", () => {
  test("returns an empty array when no generic templates or usages are present", () => {
    const code = "Class Foo\n   Public x As Integer\nEnd Class";
    assert.deepEqual([...analyzeGenericsPass(code)], []);
  });

  test("emits unknown-template for a bare TList<Product> usage with no templates declared", () => {
    const code = "Namespace m\n   Dim _x As TList<Product>\nEnd Namespace";
    const w = [...analyzeGenericsPass(code)];
    assert.ok(
      w.some((x) => x.code === "unknown-template" && x.templateName === "TList"),
      `expected unknown-template; got: ${JSON.stringify(w)}`,
    );
  });

  // Regression: the not-equal operator `<>` after a member (the idiomatic
  // event-dispatch guard `If me.OnXEvent <> NULL Then ...` used throughout
  // Forms code) was being misread as an empty generic usage `OnXEvent<>`
  // and tripped a spurious `unknown-template`.
  test("does NOT emit unknown-template for the `<> NULL` event-dispatch guard", () => {
    const code = [
      "Namespace m",
      "   Class T",
      "      OnSalvarEvent As TNotifyEvent",
      "      Sub Run()",
      "         If me.OnSalvarEvent <> NULL Then me.OnSalvarEvent(me)",
      "      End Sub",
      "   End Class",
      "End Namespace",
    ].join("\n");
    const w = [...analyzeGenericsPass(code)];
    assert.deepEqual(
      w.filter((x) => x.code === "unknown-template"),
      [],
      `expected no unknown-template; got: ${JSON.stringify(w)}`,
    );
  });

  // Regression: comparison operators `<=` / `<` followed by a numeric or
  // expression operand must not be parsed as generic type arguments.
  test("does NOT emit unknown-template for `<=` / `<` numeric comparisons", () => {
    const code = [
      "Namespace m",
      "   Class T",
      "      Sub Run(Count As Integer)",
      "         If Count <= 5 And Count > 0 Then Print Count",
      "      End Sub",
      "   End Class",
      "End Namespace",
    ].join("\n");
    const w = [...analyzeGenericsPass(code)];
    assert.deepEqual(
      w.filter((x) => x.code === "unknown-template"),
      [],
      `expected no unknown-template; got: ${JSON.stringify(w)}`,
    );
  });

  test("emits unknown-template for usage referencing a missing template", () => {
    const code = [
      "Class Box<T>",
      "   Public Item As T",
      "End Class",
      "",
      "Dim _x As TList<Product>",
    ].join("\n");
    const w = [...analyzeGenericsPass(code)];
    assert.ok(
      w.some((x) => x.code === "unknown-template" && x.templateName === "TList"),
      `expected unknown-template; got: ${JSON.stringify(w)}`,
    );
  });

  test("emits generic-arity-mismatch when arity differs", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Dim a As TList<Product, Customer>",
    ].join("\n");
    const w = [...analyzeGenericsPass(code)];
    assert.ok(
      w.some((x) => x.code === "generic-arity-mismatch" && x.expected === 1 && x.actual === 2),
      `expected generic-arity-mismatch; got: ${JSON.stringify(w)}`,
    );
  });

  test("emits duplicate-template when the same name is registered twice", () => {
    const code = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class TList<U>",
      "   Public y As U",
      "End Class",
    ].join("\n");
    const w = [...analyzeGenericsPass(code)];
    assert.ok(
      w.some((x) => x.code === "duplicate-template" && x.templateName === "TList"),
      `expected duplicate-template; got: ${JSON.stringify(w)}`,
    );
  });

  test("substitutes types in deeper generic instantiations inside template bodies", () => {
    const code = [
      "Class TListSugarPrimitive<T, K>",
      "   Value As T",
      "   Function GetValue() As K",
      "      GetValue = me.Value",
      "   End Function",
      "   Shared Function Create(pValue As T) As TListSugarPrimitive",
      "      Create = New TListSugarPrimitive(pValue)",
      "   End Function",
      "End Class",
      "",
      "Class TListSugar<T, K>",
      "   Function Push(pValue As T) As TListSugar",
      "      Push = me.Push(TListSugarPrimitive<T, K>.Create(pValue))",
      "   End Function",
      "   Function PushCType(pValue As TObject) As TListSugar",
      "      PushCType = CType(pValue, TListSugar<T, K>)",
      "   End Function",
      "End Class",
      "",
      "Dim _list As TListSugar<Integer, String> = New TListSugar<Integer, String>()",
    ].join("\n");

    const r = runGenericsPass(code);
    assert.ok(r.flatNames.includes("TListSugar_Integer_String"));
    assert.ok(r.flatNames.includes("TListSugarPrimitive_Integer_String"));
    assert.match(r.code, /TListSugarPrimitive_Integer_String\.Create\(pValue\)/);
    assert.match(r.code, /CType\(pValue, TListSugar_Integer_String\)/);
    assert.doesNotMatch(r.code, /TListSugarPrimitive_T_K/);
  });
});

describe("runGenericsPass — golden tests against docs/exemple/sugar/generic-tlist/", () => {
  // Each canonical example pairs `<name>.bas` (input) with
  // `_expected/<name>.bas` (committed output). The test runs the
  // textual pass on the input and asserts byte-for-byte equality with
  // the expected file — so a refactor that silently shifts whitespace,
  // re-orders flat declarations, or breaks the function self-reference
  // rename will fail loudly here.
  const cases = ["01-basic", "02-delegate", "03-method", "03-nested", "04-shadowing"] as const;

  for (const name of cases) {
    test(`monomorphises sugar/generic-tlist/${name}.bas to its committed _expected/`, () => {
      const src = loadExample(`sugar/generic-tlist/${name}.bas`);
      const expected = loadExample(`sugar/generic-tlist/_expected/${name}.bas`);
      const { code } = runGenericsPass(src);
      assert.equal(
        code,
        expected,
        `runGenericsPass output drifted for ${name}; regenerate the _expected file or fix the regression.`,
      );
    });
  }

  test("does NOT generate phantom flat copies from comments mentioning TList<T>", () => {
    // The 01-basic example's header comment contains `Class TList<T>` —
    // a literal reference to the template inside a `'`-prefixed line.
    // The pre-pass must NOT treat that as a usage site.
    const src = loadExample("sugar/generic-tlist/01-basic.bas");
    const { code, flatNames } = runGenericsPass(src);
    assert.ok(!flatNames.includes("TList_T"), "phantom TList_T must not be emitted");
    assert.doesNotMatch(code, /Class\s+TList_T\b/);
  });

  test("preserves Dim T As String shadowing the type parameter (Bug 1 regression)", () => {
    const src = loadExample("sugar/generic-tlist/04-shadowing.bas");
    const { code } = runGenericsPass(src);
    // Variable `T` in identifier position must survive monomorphization.
    assert.match(code, /Dim T As String/);
    // String literal "valor de T" must survive verbatim.
    assert.match(code, /"valor de T"/);
    // Comment mentioning T must survive verbatim.
    assert.match(code, /Comentario que menciona T deve ficar exato/);
  });

  test("renames function self-reference in body so the return idiom keeps working", () => {
    // `Function Wrap<T> ... Wrap = pValue ... End Function` becomes
    // `Function Wrap_Integer ... Wrap_Integer = pValue ... End Function`
    // so the monomorphic copy actually returns `pValue` (Basic returns
    // the value assigned to the function name).
    const src = loadExample("sugar/generic-tlist/03-method.bas");
    const { code } = runGenericsPass(src);
    assert.match(code, /Wrap_Integer = pValue/);
    assert.doesNotMatch(code, /^\s*Wrap = pValue/m);
  });
});
