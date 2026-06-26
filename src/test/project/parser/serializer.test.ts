import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parse, serializeUnit } from "../../../project/parser";
import type { ClassDeclaration, CompilationUnit } from "../../../project/ast/ast";

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
    assert.match(out, /Class MyList\s+Inherits TList<Integer>/);
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

  test("serialises TypeOf checks with Data7 syntax", () => {
    const src = [
      "Sub Run(pObj As TObject)",
      "   If TypeOf pObj Is TTItem<T> Then",
      "   End If",
      "   If TypeOf(pObj) Is TTItem<T> Then",
      "   End If",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /If TypeOf pObj Is TTItem<T> Then/);
    assert.match(out, /If TypeOf\(pObj\) Is TTItem<T> Then/);
    assert.doesNotMatch(out, /TypeOf\(\(?pObj\)?,/);
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

  test("serialises indexed properties and Select Case statements correctly", () => {
    const src = [
      "Class TestProp",
      "   Property Item(pIndex As Integer) As String",
      "      Get",
      '         Item = "hello"',
      "      End Get",
      "      Set(pValue As String)",
      "         me.SetItem(pIndex, pValue)",
      "      End Set",
      "   End Property",
      "End Class",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.match(out, /Property Item\(pIndex As Integer\) As String/);
    assert.match(out, /Get/);
    assert.match(out, /Set\(pValue As String\)/);
  });

  test("serialises Select Case statement correctly", () => {
    const src = [
      "Sub TestSelect()",
      "   Select Case pAdm",
      "      Case 1",
      "         x = 10",
      "      Case Else",
      "         x = 30",
      "   End Select",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.match(out, /Select Case pAdm/);
    assert.match(out, /Case 1/);
    assert.match(out, /Case Else/);
    assert.match(out, /End Select/);
  });

  test("serialises Exit statements correctly", () => {
    const src = "Sub TestExit()\n   Exit Sub\nEnd Sub";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Exit Sub/);
  });

  test("serialises Exit statements inside single-line If", () => {
    const src = ["Sub TestExitIf()", "   If pStart >= me.Length() Then Exit For", "End Sub"].join(
      "\n",
    );
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /If pStart >= me\.Length\(\) Then Exit For/);
  });

  test("expands compound assignment operators to basic assignment (GAP-02)", () => {
    const src = "Sub TestAssign()\n   x += 1\nEnd Sub";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /x = x \+ 1/);
  });

  test("serialises Throw statements correctly", () => {
    const src = "Sub TestThrow()\n   Throw New Exception()\nEnd Sub";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Throw New Exception\(\)/);
  });

  test("serialises method parameters with default values correctly (GAP-09)", () => {
    const src = "Sub TestParam(a As Integer = 10)\nEnd Sub";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Sub TestParam\(a As Integer = 10\)/);
  });

  test("serialises class fields with initializers correctly (GAP-07)", () => {
    const src = "Class TestField\n   Public x As Integer = 42\nEnd Class";
    const r = parse(src);
    const out = serializeUnit(r.unit);
    assert.match(out, /Public x As Integer = 42/);
  });

  test("serialises native array dimensions on module fields", () => {
    const src = "Private _containers(10) As Container";
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.equal(out, "Private _containers(10) As Container");
  });

  test("serialises native matrix dimensions on local variables", () => {
    const src = ["Sub Run()", "   Dim _matrix(10, 5) As Integer", "End Sub"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.match(out, /Dim _matrix\(10, 5\) As Integer/);
  });

  test("serialises native public enums without splitting the enum name", () => {
    const src = ["Public Enum Options", "   SqlServer = 0", "   Sybase = 1", "End Enum"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.match(out, /^Public Enum Options$/m);
    assert.doesNotMatch(out, /^Public Enum\r?\nOptions$/m);
  });

  test("serialises Enun sugar declarations without rewriting them as native Enum", () => {
    const src = ["Enun Color", "   Verde", "End Enun"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    assert.equal(out, src);
  });

  test("serialises and indents nested classes and structures correctly", () => {
    const src = [
      "Namespace mod_demo",
      "   Class OuterClass",
      "      Class InnerClass",
      "         Shared Sub Test()",
      "         End Sub",
      "      End Class",
      "      Structure InnerStruct",
      "         Public Value As Long",
      "      End Structure",
      "   End Class",
      "End Namespace",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out = serializeUnit(r.unit);
    const expected = [
      "Namespace mod_demo",
      "   Class OuterClass",
      "      Class InnerClass",
      "         Shared Sub Test()",
      "         End Sub",
      "      End Class",
      "      Structure InnerStruct",
      "         Public Value As Long",
      "      End Structure",
      "   End Class",
      "End Namespace",
    ].join("\n");
    assert.equal(out.trim(), expected.trim());
  });
});
