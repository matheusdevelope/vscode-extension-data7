import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parse, parseBasic } from "../../../project/parser";
import type {
  ClassDeclaration,
  DelegateDeclaration,
  MethodDeclaration,
  NamespaceDeclaration,
} from "../../../project/generics-monomorphizer/ast";

describe("parser/parser", () => {
  test("empty input parses to an empty CompilationUnit with no errors", () => {
    const r = parse("");
    assert.equal(r.unit.kind, "CompilationUnit");
    assert.deepEqual(r.unit.members, []);
    assert.deepEqual([...r.errors], []);
  });

  test("parses a simple Namespace with one Class", () => {
    const src = ["Namespace mod_demo", "   Class Foo", "   End Class", "End Namespace"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    assert.equal(r.unit.members.length, 1);
    const ns = r.unit.members[0] as NamespaceDeclaration;
    assert.equal(ns.kind, "NamespaceDeclaration");
    assert.equal(ns.name, "mod_demo");
    assert.equal(ns.members.length, 1);
    const klass = ns.members[0] as ClassDeclaration;
    assert.equal(klass.kind, "ClassDeclaration");
    assert.equal(klass.name, "Foo");
    assert.deepEqual(klass.typeParameters, []);
  });

  test("parses a generic Class with one type parameter", () => {
    const src = "Class TList<T>\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.name, "TList");
    assert.equal(klass.typeParameters.length, 1);
    assert.equal(klass.typeParameters[0]?.name, "T");
  });

  test("parses a generic Class with multiple type parameters and constraint", () => {
    const src = "Class Pair<K, V As IComparable>\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.typeParameters.length, 2);
    assert.equal(klass.typeParameters[0]?.name, "K");
    assert.equal(klass.typeParameters[1]?.name, "V");
    assert.equal(klass.typeParameters[1]?.constraint?.name, "IComparable");
  });

  test("parses Inherits with a generic base type", () => {
    const src = "Class MyList Inherits TList<Integer>\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.baseType?.name, "TList");
    assert.equal(klass.baseType?.typeArguments.length, 1);
    assert.equal(klass.baseType?.typeArguments[0]?.name, "Integer");
  });

  test("parses a Sub with parameters and an opaque body", () => {
    const src = ["Sub Add(pValue As Integer)", "   me.Count = me.Count + 1", "End Sub"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.kind, "MethodDeclaration");
    assert.equal(m.name, "Add");
    assert.equal(m.parameters.length, 1);
    assert.equal(m.parameters[0]?.name, "pValue");
    assert.equal(m.parameters[0]?.type.name, "Integer");
    // Body is preserved as a single OpaqueStatement carrying the source text.
    assert.equal(m.body.length, 1);
    const stmt = m.body[0];
    assert.equal(stmt?.kind, "OpaqueStatement");
    if (stmt?.kind === "OpaqueStatement") {
      assert.match(stmt.text, /me\.Count/);
    }
  });

  test("parses a Function with generic type params and return type", () => {
    const src = ["Function Wrap<T>(pValue As T) As T", "   Wrap = pValue", "End Function"].join(
      "\n",
    );
    const r = parse(src);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.name, "Wrap");
    assert.equal(m.typeParameters.length, 1);
    assert.equal(m.typeParameters[0]?.name, "T");
    assert.equal(m.returnType?.name, "T");
    assert.equal(m.parameters[0]?.type.name, "T");
  });

  test("parses a generic Delegate", () => {
    const src = "Delegate Function Pred<T>(pValue As T) As Boolean";
    const r = parse(src);
    const d = r.unit.members[0] as DelegateDeclaration;
    assert.equal(d.kind, "DelegateDeclaration");
    assert.equal(d.name, "Pred");
    assert.equal(d.typeParameters.length, 1);
    assert.equal(d.returnType?.name, "Boolean");
  });

  test("parses nested generic type arguments TList<TList<Integer>>", () => {
    const src = "Class Dummy\n   Public x As TList<TList<Integer>>\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.members.length, 1);
    const field = klass.members[0];
    assert.equal(field?.kind, "FieldDeclaration");
    if (field?.kind === "FieldDeclaration") {
      assert.equal(field.type.name, "TList");
      assert.equal(field.type.typeArguments.length, 1);
      assert.equal(field.type.typeArguments[0]?.name, "TList");
      assert.equal(field.type.typeArguments[0]?.typeArguments[0]?.name, "Integer");
    }
  });

  test("parses dotted type names like Forms.TForm", () => {
    const src = "Class C\n   Public f As Forms.TForm\nEnd Class";
    const r = parse(src);
    const klass = r.unit.members[0] as ClassDeclaration;
    const field = klass.members[0];
    if (field?.kind === "FieldDeclaration") {
      assert.equal(field.type.name, "Forms.TForm");
    } else {
      assert.fail("expected a field declaration");
    }
  });

  test("reports unterminated-block when Class is missing End Class", () => {
    const src = "Class Foo\n   Public x As Integer\n";
    const r = parse(src);
    assert.ok(r.errors.some((e) => e.code === "unterminated-block"));
  });

  test("parseBasic alias is equivalent to parse", () => {
    const src = "Namespace m\nEnd Namespace";
    const a = parse(src);
    const b = parseBasic(src);
    assert.equal(a.unit.members.length, b.unit.members.length);
    assert.equal(a.errors.length, b.errors.length);
  });

  test("recovers from a malformed line and continues parsing", () => {
    const src = [
      "Class Good",
      "End Class",
      "??garbage on this line",
      "Class AlsoGood",
      "End Class",
    ].join("\n");
    const r = parse(src);
    // Both classes should still be parsed even with a malformed line between them.
    const klasses = r.unit.members.filter((m) => m.kind === "ClassDeclaration");
    assert.equal(klasses.length, 2);
  });
});
