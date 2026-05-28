import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parse, serializeUnit } from "../../../project/parser";
import type {
  ClassDeclaration,
  CompilationUnit,
} from "../../../project/generics-monomorphizer/ast";

describe("parser/serializer", () => {
  test("serialises an empty unit to an empty string", () => {
    const unit: CompilationUnit = { kind: "CompilationUnit", members: [] };
    assert.equal(serializeUnit(unit), "");
  });

  test("serialises a Namespace with End Namespace at the matching indent", () => {
    const src = "Namespace m\nEnd Namespace";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /^Namespace m\n/);
    assert.match(out, /End Namespace$/);
  });

  test("emits the class header with generic <T> when typeParameters present", () => {
    const src = "Class TList<T>\nEnd Class";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /^Class TList<T>\n/);
  });

  test("omits the generic <T> when typeParameters were cleared (monomorphized case)", () => {
    const src = "Class TList<T>\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    klass.name = "TList_Product";
    klass.typeParameters = [];
    const out = serializeUnit(r.unit);
    assert.match(out, /^Class TList_Product\n/);
    assert.doesNotMatch(out, /<[A-Z_]+>/);
  });

  test("re-emits Inherits clause", () => {
    const src = "Class MyList Inherits TList<Integer>\nEnd Class";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Class MyList Inherits TList<Integer>/);
  });

  test("serialises a Sub with parameters and an opaque body line", () => {
    const src = ["Sub Add(pValue As Integer)", "   me.Count = me.Count + 1", "End Sub"].join("\n");
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Sub Add\(pValue As Integer\)/);
    assert.match(out, /me\.Count = me\.Count \+ 1/);
    assert.match(out, /End Sub$/);
  });

  test("serialises a generic Delegate", () => {
    const src = "Delegate Function Pred<T>(pValue As T) As Boolean";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Delegate Function Pred<T>\(pValue As T\) As Boolean/);
  });

  test("emits nested generic type arguments", () => {
    const src = "Class C\n   Public x As TList<TList<Integer>>\nEnd Class";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /As TList<TList<Integer>>/);
  });

  test("uses 3-space indentation per nesting level", () => {
    const src = [
      "Namespace m",
      "   Class Foo",
      "      Public x As Integer",
      "   End Class",
      "End Namespace",
    ].join("\n");
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(
      out,
      /^Namespace m\n {3}Class Foo\n {6}Public x As Integer\n {3}End Class\nEnd Namespace$/,
    );
  });

  test("respects custom eol option", () => {
    const src = "Class Foo\nEnd Class";
    const r = parse(src);
    const out = serializeUnit(r.unit, { eol: "\r\n" });
    assert.match(out, /\r\n/);
  });
});
