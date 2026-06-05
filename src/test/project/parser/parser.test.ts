import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parse, parseBasic } from "../../../project/parser";
import type {
  ClassDeclaration,
  DelegateDeclaration,
  MethodDeclaration,
  NamespaceDeclaration,
  VariableDeclaration,
} from "../../../project/ast/ast";

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

  test("parses a Sub with parameters and a structural body", () => {
    const src = ["Sub Add(pValue As Integer)", "   me.Count = me.Count + 1", "End Sub"].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.kind, "MethodDeclaration");
    assert.equal(m.name, "Add");
    assert.equal(m.parameters.length, 1);
    assert.equal(m.parameters[0]?.name, "pValue");
    assert.equal(m.parameters[0]?.type.name, "Integer");
    assert.equal(m.body.length, 1);
    const stmt = m.body[0];
    assert.equal(stmt?.kind, "Assignment");
    if (stmt?.kind === "Assignment") {
      assert.equal(stmt.operator, "=");
      assert.equal(stmt.target.kind, "MemberAccess");
      if (stmt.target.kind === "MemberAccess") {
        assert.equal(stmt.target.member, "Count");
        assert.equal(stmt.target.target.kind, "Identifier");
        if (stmt.target.target.kind === "Identifier") {
          assert.equal(stmt.target.target.name, "me");
        }
      }
      assert.equal(stmt.value.kind, "BinaryExpression");
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

  test("parses If-ElseIf-Else statements structurally", () => {
    const src = [
      "Sub TestIf()",
      "   If x = 1 Then",
      "      y = 10",
      "   ElseIf x = 2 Then",
      "      y = 20",
      "   Else",
      "      y = 30",
      "   End If",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const iff = m.body[0];
    assert.equal(iff?.kind, "IfStatement");
    if (iff?.kind === "IfStatement") {
      assert.equal(iff.condition.kind, "BinaryExpression");
      assert.equal(iff.thenBranch.length, 1);
      assert.equal(iff.elseIfBranches.length, 1);
      assert.equal(iff.elseIfBranches[0]?.condition.kind, "BinaryExpression");
      assert.equal(iff.elseIfBranches[0]?.body.length, 1);
      assert.ok(iff.elseBranch);
      assert.equal(iff.elseBranch.length, 1);
    }
  });

  test("parses For and For Each loops structurally", () => {
    const src = [
      "Sub TestLoops()",
      "   For i = 0 To 10 Step 2",
      "      x = i",
      "   Next i",
      "   For Each element As Integer In list",
      "      y = element",
      "   Next",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.body[0]?.kind, "ForStatement");
    assert.equal(m.body[1]?.kind, "ForEachStatement");
  });

  test("parses Try-Catch-Finally statements structurally", () => {
    const src = [
      "Sub TestTry()",
      "   Try",
      "      DoSomething()",
      "   Catch ex As Exception",
      "      LogError(ex)",
      "   Finally",
      "      Cleanup()",
      "   End Try",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const tryStmt = m.body[0];
    assert.equal(tryStmt?.kind, "TryCatchStatement");
    if (tryStmt?.kind === "TryCatchStatement") {
      assert.equal(tryStmt.tryBody.length, 1);
      assert.equal(tryStmt.catchVar?.name, "ex");
      assert.equal(tryStmt.catchType?.name, "Exception");
      assert.equal(tryStmt.catchBody.length, 1);
      assert.ok(tryStmt.finallyBody);
      assert.equal(tryStmt.finallyBody.length, 1);
    }
  });

  test("parses Using statements structurally", () => {
    const src = [
      "Sub TestUsing()",
      "   Using conn As New Connection(connString)",
      "      conn.Open()",
      "   End Using",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const usingStmt = m.body[0];
    assert.equal(usingStmt?.kind, "UsingStatement");
    if (usingStmt?.kind === "UsingStatement") {
      assert.equal(usingStmt.resourceVar.name, "conn");
      assert.equal(usingStmt.resourceType.name, "Connection");
      assert.equal(usingStmt.resourceArgs.length, 1);
      assert.equal(usingStmt.body.length, 1);
    }
  });

  test("parses Match statements structurally", () => {
    const src = [
      "Sub TestMatch()",
      "   Match obj",
      "      Case Is TButton:",
      "         Click()",
      "      Case Else:",
      "         Noop()",
      "   End Match",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const matchStmt = m.body[0];
    assert.equal(matchStmt?.kind, "MatchStatement");
    if (matchStmt?.kind === "MatchStatement") {
      assert.equal(matchStmt.subject.kind, "Identifier");
      assert.equal(matchStmt.cases.length, 2);
      assert.equal(matchStmt.cases[0]?.typeName, "TButton");
      assert.equal(matchStmt.cases[0]?.body.length, 1);
      assert.equal(matchStmt.cases[1]?.isElse, true);
      assert.equal(matchStmt.cases[1]?.body.length, 1);
    }
  });

  test("parses ternary, null-coalescing, pipe and tagged template expressions", () => {
    const src = [
      "Sub TestExprs()",
      "   Dim a = cond ? x : y",
      "   Dim b = first ?? fallback",
      "   Dim c = data |> Trim |> UCase",
      "   Dim d = sql$\"select * from {tbl}\"",
      "End Sub"
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    
    const d1 = m.body[0] as VariableDeclaration;
    assert.equal(d1.initializer?.kind, "TernaryExpression");
    
    const d2 = m.body[1] as VariableDeclaration;
    assert.equal(d2.initializer?.kind, "NullCoalescingExpression");
    
    const d3 = m.body[2] as VariableDeclaration;
    assert.equal(d3.initializer?.kind, "PipeExpression");
    
    const d4 = m.body[3] as VariableDeclaration;
    assert.equal(d4.initializer?.kind, "TaggedTemplateExpression");
  });

  // -------------------------------------------------------------------------
  // Sub New / constructor support
  // -------------------------------------------------------------------------

  test("parses Sub New with parameters — name is preserved as 'New'", () => {
    const src = [
      "Sub New(pCode As String, pName As String)",
      "   MyBase.New()",
      "   me.Code = pCode",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], [], "Sub New should parse without errors");
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.kind, "MethodDeclaration");
    assert.equal(m.name, "New", "constructor name must be 'New'");
    assert.equal(m.isConstructor, true, "isConstructor flag must be set");
    assert.equal(m.parameters.length, 2);
    assert.equal(m.parameters[0]?.name, "pCode");
    assert.equal(m.parameters[0]?.type.name, "String");
    assert.equal(m.parameters[1]?.name, "pName");
  });

  test("parses Sub New inside a Class and marks it as constructor", () => {
    const src = [
      "Class TProduto",
      "   Public Codigo As String",
      "   Sub New(pCodigo As String, pPreco As Double)",
      "      MyBase.New()",
      "      me.Codigo = pCodigo",
      "   End Sub",
      "   Function GetPreco() As Double",
      "      GetPreco = 0.0",
      "   End Function",
      "End Class",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], [], "Class with Sub New should parse without errors");
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.kind, "ClassDeclaration");
    assert.equal(klass.name, "TProduto");
    // Sub New is the second member (after the field)
    const ctor = klass.members.find(
      (m) => m.kind === "MethodDeclaration" && m.name.toLowerCase() === "new",
    ) as MethodDeclaration | undefined;
    assert.ok(ctor, "Should find a constructor method");
    assert.equal(ctor?.isConstructor, true);
    assert.equal(ctor?.parameters.length, 2);
    assert.equal(ctor?.parameters[0]?.name, "pCodigo");
    assert.equal(ctor?.parameters[1]?.name, "pPreco");
    // Regular method should NOT be marked as constructor
    const getPreco = klass.members.find(
      (m) => m.kind === "MethodDeclaration" && m.name === "GetPreco",
    ) as MethodDeclaration | undefined;
    assert.ok(getPreco, "Should find GetPreco method");
    assert.ok(!getPreco?.isConstructor, "Regular method must NOT have isConstructor set");
  });

  test("Sub New round-trips through serializer correctly", () => {
    const { serializeUnit } = require("../../../project/parser/serializer");
    const src = [
      "Class TItem",
      "   Sub New(pVal As Integer)",
      "      MyBase.New()",
      "      me.Val = pVal",
      "   End Sub",
      "End Class",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const out: string = serializeUnit(r.unit);
    assert.ok(out.includes("Sub New("), `Expected 'Sub New(' in serialized output, got:\n${out}`);
    assert.ok(out.includes("pVal As Integer"), `Expected parameter in serialized output`);
    assert.ok(!out.includes("Sub ("), "Serializer must not emit 'Sub (' (lost name)");
  });

  test("parses indexed properties with parameters", () => {
    const src = [
      "Class TestProp",
      "   Property Item(pIndex As Integer) As String",
      "      Get",
      "         Item = \"hello\"",
      "      End Get",
      "      Set(pValue As String)",
      "         me.SetItem(pIndex, pValue)",
      "      End Set",
      "   End Property",
      "End Class",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const klass = r.unit.members[0] as ClassDeclaration;
    const prop = klass.members[0];
    assert.equal(prop?.kind, "PropertyDeclaration");
    if (prop?.kind === "PropertyDeclaration") {
      assert.equal(prop.name, "Item");
      assert.equal(prop.type.name, "String");
      assert.ok(prop.parameters);
      assert.equal(prop.parameters.length, 1);
      assert.equal(prop.parameters[0]?.name, "pIndex");
      assert.equal(prop.parameters[0]?.type.name, "Integer");
      assert.ok(prop.getter);
      assert.ok(prop.setter);
      assert.equal(prop.setter.parameters.length, 1);
      assert.equal(prop.setter.parameters[0]?.name, "pValue");
    }
  });

  test("parses Select and Select Case statements structurally", () => {
    const src = [
      "Sub TestSelect()",
      "   Select Case pAdm",
      "      Case 1",
      "         x = 10",
      "      Case 2, 3",
      "         x = 20",
      "      Case Else",
      "         x = 30",
      "   End Select",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const selectStmt = m.body[0];
    assert.equal(selectStmt?.kind, "SelectCaseStatement");
    if (selectStmt?.kind === "SelectCaseStatement") {
      assert.equal(selectStmt.expression.kind, "Identifier");
      assert.equal(selectStmt.cases.length, 3);
      assert.equal(selectStmt.cases[0]?.isElse, false);
      assert.equal(selectStmt.cases[0]?.values.length, 1);
      assert.equal(selectStmt.cases[1]?.values.length, 2);
      assert.equal(selectStmt.cases[2]?.isElse, true);
    }
  });

  test("parses Exit statement structurally (GAP-01)", () => {
    const src = [
      "Sub TestExit()",
      "   Exit Sub",
      "   Exit Function",
      "   Exit For",
      "   Exit Do",
      "   Exit While",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.body[0]?.kind, "ExitStatement");
    assert.equal((m.body[0] as any).target, "Sub");
    assert.equal((m.body[1] as any).target, "Function");
    assert.equal((m.body[2] as any).target, "For");
    assert.equal((m.body[3] as any).target, "Do");
    assert.equal((m.body[4] as any).target, "While");
  });

  test("parses compound assignment operators (GAP-02)", () => {
    const src = [
      "Sub TestAssign()",
      "   x += 1",
      "   y -= 2",
      "   z *= 3",
      "   w /= 4",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.body[0]?.kind, "Assignment");
    assert.equal((m.body[0] as any).operator, "+=");
    assert.equal((m.body[1] as any).operator, "-=");
    assert.equal((m.body[2] as any).operator, "*=");
    assert.equal((m.body[3] as any).operator, "/=");
  });

  test("parses multi-variable declarations as a Block of VariableDeclarations (GAP-04)", () => {
    const src = [
      "Sub TestMultiDim()",
      "   Dim i As Integer, count As Integer = 10",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    const block = m.body[0];
    assert.equal(block?.kind, "Block");
    if (block?.kind === "Block") {
      assert.equal(block.statements.length, 2);
      assert.equal(block.statements[0]?.kind, "VariableDeclaration");
      assert.equal((block.statements[0] as any).name, "i");
      assert.equal((block.statements[0] as any).type?.name, "Integer");
      assert.equal(block.statements[1]?.kind, "VariableDeclaration");
      assert.equal((block.statements[1] as any).name, "count");
      assert.equal((block.statements[1] as any).type?.name, "Integer");
      assert.equal((block.statements[1] as any).initializer?.kind, "Literal");
    }
  });

  test("parses Throw statement structurally (GAP-05)", () => {
    const src = [
      "Sub TestThrow()",
      "   Throw New Exception(\"error\")",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.body[0]?.kind, "ThrowStatement");
    assert.equal((m.body[0] as any).expression.kind, "ObjectCreationExpression");
  });

  test("parses method parameters with default values (GAP-09)", () => {
    const src = [
      "Sub New(pTimeToStart As Integer = 10)",
      "End Sub",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const m = r.unit.members[0] as MethodDeclaration;
    assert.equal(m.parameters.length, 1);
    assert.equal(m.parameters[0]?.name, "pTimeToStart");
    assert.equal(m.parameters[0]?.type.name, "Integer");
    assert.ok(m.parameters[0]?.defaultValue);
    assert.equal(m.parameters[0]?.defaultValue?.kind, "Literal");
  });

  test("parses class field with inline initializer (GAP-07)", () => {
    const src = [
      "Class TestFieldInit",
      "   CheckEvents As Boolean = False",
      "End Class",
    ].join("\n");
    const r = parse(src);
    assert.deepEqual([...r.errors], []);
    const klass = r.unit.members[0] as ClassDeclaration;
    assert.equal(klass.members.length, 1);
    assert.equal(klass.members[0]?.kind, "FieldDeclaration");
    assert.equal((klass.members[0] as any).name, "CheckEvents");
    assert.equal((klass.members[0] as any).type.name, "Boolean");
    assert.ok((klass.members[0] as any).initializer);
    assert.equal((klass.members[0] as any).initializer.kind, "Literal");
  });
});

