import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { runGenericsViaAST } from "../../project/generics-driver";
import { runGenericsPass } from "../../project/generics-pass";

describe("runGenericsViaAST", () => {
  test("monomorphises a simple TList<Product> usage", () => {
    const src = [
      "Class TList<T>",
      "   Public Count As Integer",
      "   Sub Add(pValue As T)",
      "      me.Count = me.Count + 1",
      "   End Sub",
      "End Class",
      "",
      "Class Demo",
      "   Public _items As TList<Product>",
      "End Class",
    ].join("\n");
    const r = runGenericsViaAST(src);
    assert.ok(r.flatNames.includes("TList_Product"));
    assert.match(r.code, /Class TList_Product/);
    assert.match(r.code, /pValue As Product/);
    // The original generic declaration must be GONE.
    assert.doesNotMatch(r.code, /Class TList<T>/);
  });

  test("emits flatNames in parity with the textual pass on the same input", () => {
    const src = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class A",
      "   Public a As TList<Integer>",
      "   Public b As TList<Product>",
      "End Class",
    ].join("\n");
    const ast = runGenericsViaAST(src);
    const textual = runGenericsPass(src);
    assert.deepEqual([...ast.flatNames].sort(), [...textual.flatNames].sort());
  });

  test("emits unknown-template warning for an undeclared template usage", () => {
    const src = [
      "Class Box<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class C",
      "   Public _x As TList<Product>",
      "End Class",
    ].join("\n");
    const r = runGenericsViaAST(src);
    assert.ok(
      r.warnings.some((w) => w.code === "unknown-template" && w.templateName === "TList"),
      `expected unknown-template; got ${JSON.stringify(r.warnings)}`,
    );
  });

  test("emits generic-arity-mismatch (mapped from engine's arity-mismatch)", () => {
    const src = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class C",
      "   Public _a As TList<Product, Customer>",
      "End Class",
    ].join("\n");
    const r = runGenericsViaAST(src);
    // The engine reports the mismatch as `arity-mismatch` but the
    // driver remaps it to the textual-pass code `generic-arity-mismatch`
    // so downstream consumers (DiagnosticCodes, examples-coverage) see
    // the same identifier regardless of pipeline.
    assert.ok(
      r.warnings.some((w) => w.code === "generic-arity-mismatch"),
      `expected generic-arity-mismatch; got ${JSON.stringify(r.warnings)}`,
    );
  });

  test("emits duplicate-template when two templates share the same name", () => {
    const src = [
      "Class TList<T>",
      "   Public x As T",
      "End Class",
      "",
      "Class TList<U>",
      "   Public y As U",
      "End Class",
    ].join("\n");
    const r = runGenericsViaAST(src);
    assert.ok(
      r.warnings.some((w) => w.code === "duplicate-template" && w.templateName === "TList"),
    );
  });

  test("emits class-generic-method-unsupported when a class has a generic method", () => {
    const src = [
      "Class Helper",
      "   Sub Process<T>(pItem As T)",
      "      Return",
      "   End Sub",
      "End Class",
    ].join("\n");
    const r = runGenericsViaAST(src);
    assert.ok(
      r.warnings.some((w) => w.code === "class-generic-method-unsupported"),
      `expected class-generic-method-unsupported; got ${JSON.stringify(r.warnings)}`,
    );
  });

  test("preserves non-generic code verbatim (round-trip)", () => {
    const src = [
      "Namespace m_demo",
      "   Class Foo",
      "      Public x As Integer",
      "   End Class",
      "End Namespace",
    ].join("\n");
    const r = runGenericsViaAST(src);
    assert.match(r.code, /Class Foo/);
    assert.match(r.code, /End Namespace/);
    assert.deepEqual([...r.warnings], []);
    assert.deepEqual([...r.flatNames], []);
  });
});
