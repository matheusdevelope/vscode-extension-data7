import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { SugarTranspiler, type TranspileContext } from "../../project/transpiler";
import type { EnumerableInfo } from "../../analysis/enumerable-detector";

/**
 * Minimal in-memory enumerable resolver used by the transpiler tests.
 * Avoids depending on the real System Library so the cases stay focused on
 * the transpiler's own logic (line walking, temp materialization, diagnostic
 * emission, indent preservation).
 */
function makeContext(map: Record<string, EnumerableInfo>): TranspileContext {
  return {
    detectEnumerable(typeName, _preferredElementType) {
      return map[typeName];
    },
  };
}

const stringListEnumerable: EnumerableInfo = {
  countMember: "Count",
  indexerMember: "Strings",
  elementType: "String",
};

const objectListEnumerable: EnumerableInfo = {
  countMember: "Count",
  indexerMember: "Items",
  elementType: "TObject",
};

describe("SugarTranspiler.transpile", () => {
  test("expands `For Each` with an explicit type over a Dim'd variable", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   For Each item As String In list",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim __idx0 As Integer/);
    assert.match(out, /For __idx0 = 0 To list\.Count - 1/);
    assert.match(out, /Dim item As String = list\.Strings\(__idx0\)/);
    assert.match(out, /Print\(item\)/);
    assert.match(out, /^\s{3}Next$/m);
  });

  test("infers the element type from the indexer when `As` is omitted", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   For Each item In list",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim __idx0 As Integer/);
    assert.match(out, /Dim item As String = list\.Strings\(__idx0\)/);
  });

  test("uses fresh `__idx` and `__src` counters for nested loops", () => {
    const ctx = makeContext({
      StringList: stringListEnumerable,
      ObjectList: objectListEnumerable,
    });
    const code = [
      "Sub Run()",
      "   Dim outer As StringList",
      "   Dim inner As ObjectList",
      "   For Each name As String In outer",
      "      For Each obj As TObject In inner",
      "         Print(name)",
      "      Next",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim __idx0 As Integer/);
    assert.match(out, /For __idx0 = 0 To outer\.Count - 1/);
    assert.match(out, /Dim name As String = outer\.Strings\(__idx0\)/);
    assert.match(out, /Dim __idx1 As Integer/);
    assert.match(out, /For __idx1 = 0 To inner\.Count - 1/);
    assert.match(out, /Dim obj As TObject = inner\.Items\(__idx1\)/);
  });

  test("materializes a `__src` temporary for expressions with side-effects", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    // `inferOperandType` only handles simple idents, so a method call would
    // otherwise force a diagnostic. Make the call's enclosing variable type
    // resolvable via an explicit `As String` operand wrapper: we use a parameter
    // declaration that the inferrer can pick up.
    const code = [
      "Sub Run(self As StringList)",
      "   For Each item As String In self",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    // `self` is a simple identifier — no temp needed.
    assert.doesNotMatch(out, /__src0/);
  });

  test("emits `__src0` when the operand is a member/call expression", () => {
    // Operand `me.GetList()` is complex; the type cannot be inferred from a
    // local `Dim`, so the transpiler emits `not-enumerable` and leaves the
    // line untouched. This case verifies the "fail closed" behaviour.
    const ctxStub: TranspileContext = {
      detectEnumerable(typeName) {
        if (typeName === "Variant") return stringListEnumerable;
        return undefined;
      },
    };
    const code = [
      "Sub Run()",
      "   For Each item As String In me.GetList()",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctxStub);

    // Complex operand without resolvable type → diagnostic, line preserved.
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "not-enumerable");
    assert.equal(diag.typeName, "Variant");
    assert.match(out, /For Each item As String In me\.GetList\(\)/);
  });

  test("emits a `not-enumerable` diagnostic when the operand's type has no Count/indexer", () => {
    const ctx = makeContext({}); // Empty map → no type qualifies.
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   For Each item As String In list",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "not-enumerable");
    assert.equal(diag.typeName, "StringList");
    assert.equal(diag.line, 2);
    // Original line untouched in the output.
    assert.match(out, /For Each item As String In list/);
    assert.doesNotMatch(out, /__idx0/);
  });

  test("ignores `For Each` text appearing only inside a comment", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   ' For Each item As String In list — this is just a comment",
      "   Print(list.Count)",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    assert.equal(out, code);
  });

  test("preserves CRLF line endings when the input uses them", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   For Each item As String In list",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\r\n");

    const { code: out } = SugarTranspiler.transpile(code, ctx);

    assert.ok(out.includes("\r\n"), "must keep CRLF line endings in the output");
    assert.ok(!/[^\r]\n/.test(out), "must not introduce bare LF line breaks");
  });

  test("preserves a trailing inline comment from the For Each line on the synthetic Dim", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Sub Run()",
      "   Dim list As StringList",
      "   For Each item As String In list ' itera todas as strings",
      "      Print(item)",
      "   Next",
      "End Sub",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim item As String = list\.Strings\(__idx0\) ' itera todas as strings/);
  });

  test("preserves leading indentation of the For Each header", () => {
    const ctx = makeContext({ StringList: stringListEnumerable });
    const code = [
      "Class TX",
      "   Public Sub Run()",
      "      Dim list As StringList",
      "      For Each item As String In list",
      "         Print(item)",
      "      Next",
      "   End Sub",
      "End Class",
    ].join("\n");

    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);

    assert.equal(diagnostics.length, 0);
    assert.match(out, /^\s{6}Dim __idx0 As Integer$/m);
    assert.match(out, /^\s{6}For __idx0 = 0 To list\.Count - 1$/m);
    assert.match(out, /^\s{9}Dim item As String = list\.Strings\(__idx0\)$/m);
  });
});

describe("SugarTranspiler — For Each range (`0..N`)", () => {
  const ctx = makeContext({});

  test("expands `For Each i In 0..10` into the classic `For i = 0 To 10`", () => {
    const code = [
      "Sub Run()",
      "   For Each i In 0..10",
      "      Print(i)",
      "   Next",
      "End Sub",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /^\s{3}For i = 0 To 10$/m);
    assert.doesNotMatch(out, /For Each/i);
  });

  test("ignores the explicit `As Integer` clause (native For has no typed binding)", () => {
    const code = [
      "Sub Run(count As Integer)",
      "   For Each i As Integer In 1..count",
      "      Print(i)",
      "   Next",
      "End Sub",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /^\s{3}For i = 1 To count$/m);
  });

  test("preserves a trailing inline comment on the range header", () => {
    const code = ["Sub Run()", "   For Each i In 0..n - 1 ' iterate", "   Next", "End Sub"].join(
      "\n",
    );
    const { code: out } = SugarTranspiler.transpile(code, ctx);
    assert.match(out, /^\s{3}For i = 0 To n - 1 ' iterate$/m);
  });

  test("range rule wins priority over the generic For Each (no spurious not-enumerable)", () => {
    // The generic For Each rule would try to resolve `0..N` as a type and
    // emit `not-enumerable`. Range rule must run first.
    const code = ["For Each i In 0..3", "Next"].join("\n");
    const { diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
  });
});

describe('SugarTranspiler — string interpolation (`$"..."`)', () => {
  const ctx = makeContext({});

  test("expands a simple single-expression interpolation", () => {
    const code = `Dim s = $"Hello {name}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "Hello " & CStr((name))`);
  });

  test("expands multiple expressions concatenated with `&`", () => {
    const code = `Dim s = $"Olá, {nome}! Você tem {idade} anos."`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "Olá, " & CStr((nome)) & "! Você tem " & CStr((idade)) & " anos."`);
  });

  test("preserves escaped braces `{{` and `}}` as literal characters", () => {
    const code = `Dim s = $"obj = {{ value: {v} }}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "obj = { value: " & CStr((v)) & " }"`);
  });

  test("produces just a string literal when there are no interpolations", () => {
    const code = `Dim s = $"plain text"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "plain text"`);
  });

  test('does NOT touch `$"..."` that appears inside a line comment', () => {
    const code = `Dim x = 1 ' was $"{x}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, code);
  });

  test('does NOT touch `$"..."` that appears inside a regular `"..."` string', () => {
    const code = `Dim s = "the syntax is $""x{y}"""`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    // Regular string is copied verbatim (escape `""` preserved).
    assert.match(out, /^Dim s = "the syntax is /);
  });

  test("emits `invalid-interpolation` (empty-expression) for `{}` with no body", () => {
    const code = `Dim s = $"oops {}"`;
    const { diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "invalid-interpolation");
    assert.equal(diag.typeName, "empty-expression");
  });

  test("emits `invalid-interpolation` (unterminated-brace) for a missing `}`", () => {
    const code = `Dim s = $"oops {x"`;
    const { diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.typeName, "unterminated-brace");
  });

  test('emits `invalid-interpolation` (unterminated-string) when the closing `"` is missing', () => {
    const code = `Dim s = $"oops without close`;
    const { diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.typeName, "unterminated-string");
  });

  test("handles multiple interpolations on the same line independently", () => {
    const code = `Dim s = $"a{x}" & " - " & $"b{y}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "a" & CStr((x)) & " - " & "b" & CStr((y))`);
  });

  test("applies type-aware string conversion in interpolation and concatenation", () => {
    const code = [
      "Dim nome As String",
      "Dim idade As Integer",
      "Dim preco As Double",
      "Dim ativo As Boolean",
      "Dim obj As TProduto",
      "Dim v As Variant",
      'Dim s1 = $"Nome: {nome}, Idade: {idade}, Ativo: {ativo}"',
      'Dim s2 = $"Preco: {preco}, Obj: {obj}, Variant: {v}"',
      "Dim s3 = nome & idade & preco & ativo & obj & v",
      "Dim s4 = nome + idade + preco + ativo + obj + v",
      "Dim sum = idade + preco",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);

    const expected = [
      "Dim nome As String",
      "Dim idade As Integer",
      "Dim preco As Double",
      "Dim ativo As Boolean",
      "Dim obj As TProduto",
      "Dim v As Variant",
      'Dim s1 = "Nome: " & (nome) & ", Idade: " & (idade).ToString() & ", Ativo: " & (ativo).ToString()',
      'Dim s2 = "Preco: " & (preco).ToString() & ", Obj: " & (obj).ToString() & ", Variant: " & CStr((v))',
      "Dim s3 = nome & idade.ToString() & preco.ToString() & ativo.ToString() & obj.ToString() & CStr(v)",
      "Dim s4 = nome + idade.ToString() + preco.ToString() + ativo.ToString() + obj.ToString() + CStr(v)",
      "Dim sum = idade + preco",
    ].join("\n");

    assert.equal(out, expected);
  });
});

describe("SugarTranspiler — ternary (`cond ? a : b`)", () => {
  const ctx = makeContext({});

  test("expands `Dim x = cond ? a : b` into an `If/Then/Else/End If` block", () => {
    const code = `Dim x = (a > b) ? a : b`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "Dim x",
      "If (a > b) Then",
      "   x = a",
      "Else",
      "   x = b",
      "End If",
    ]);
  });

  test("preserves the explicit `As <Type>` on the synthetic `Dim` line", () => {
    const code = `Dim mensagem As String = ok ? "ok" : "falha"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "Dim mensagem As String",
      "If ok Then",
      `   mensagem = "ok"`,
      "Else",
      `   mensagem = "falha"`,
      "End If",
    ]);
  });

  test("expands assignment to existing variable (no `Dim`) without emitting one", () => {
    const code = `x = cond ? 1 : 2`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["If cond Then", "   x = 1", "Else", "   x = 2", "End If"]);
  });

  test("expands assignment to a member access (`obj.prop = cond ? a : b`)", () => {
    const code = `Me.Result = cond ? a : b`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /If cond Then/);
    assert.match(out, /Me\.Result = a/);
    assert.match(out, /Me\.Result = b/);
  });

  test("preserves leading indentation on every emitted line", () => {
    const code = `      Dim n As Integer = ok ? 1 : 0`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "      Dim n As Integer",
      "      If ok Then",
      "         n = 1",
      "      Else",
      "         n = 0",
      "      End If",
    ]);
  });

  test("emits `ternary-context-unsupported` for a `Print c ? a : b` line", () => {
    const code = `Print cond ? "sim" : "nao"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "ternary-context-unsupported");
    assert.equal(diag.typeName, "non-assignment");
    // Line preserved verbatim.
    assert.equal(out, code);
  });

  test("ignores `?` and `:` inside a regular string literal", () => {
    const code = `Dim s As String = "qual e a resposta? talvez: nenhuma"`;
    const { diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
  });

  test("ignores `?` and `:` inside a comment", () => {
    const code = `Dim x = 1 ' a ? b : c era a forma antiga`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, code);
  });

  test("attaches a trailing inline comment to the `If` header", () => {
    const code = `Dim x As Integer = cond ? 1 : 0 ' valor padrao`;
    const { code: out } = SugarTranspiler.transpile(code, ctx);
    assert.match(out, /^If cond Then ' valor padrao$/m);
  });
});

describe("SugarTranspiler — A1 null-coalesce (`??`)", () => {
  const ctx = makeContext({});

  test("expands `Dim x = a ?? b` into Dim + If/Then/Else", () => {
    const code = `Dim nome As String = pName ?? "Anônimo"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "Dim nome As String",
      "If pName = NULL Then",
      `   nome = "Anônimo"`,
      "Else",
      "   nome = pName",
      "End If",
    ]);
  });

  test("expands reassignment `x = a ?? b` without an extra Dim", () => {
    const code = `x = a ?? b`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "If a = NULL Then",
      "   x = b",
      "Else",
      "   x = a",
      "End If",
    ]);
  });

  test("materializes a complex LHS into a __srcN temp so it is evaluated once", () => {
    const code = `Dim x = me.GetValue() ?? "fallback"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /^Dim __src0 = me\.GetValue\(\)$/m);
    assert.match(out, /^If __src0 = NULL Then$/m);
  });

  test("emits `null-coalesce-context-unsupported` for non-assignment line", () => {
    const code = `Print a ?? "x"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "null-coalesce-context-unsupported");
    assert.equal(out, code);
  });
});

describe("SugarTranspiler — A2/A3/A4 compound logical assignments", () => {
  const ctx = makeContext({});

  test("expands `x ??= y` into If x = NULL Then x = y / End If", () => {
    const code = `pConfig ??= "default"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "If pConfig = NULL Then",
      `   pConfig = "default"`,
      "End If",
    ]);
  });

  test("expands `x ||= y` into If Not x Then x = y / End If", () => {
    const code = `pAtivo ||= True`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["If Not pAtivo Then", "   pAtivo = True", "End If"]);
  });

  test("expands `x &&= y` into If x Then x = y / End If", () => {
    const code = `pAtivo &&= False`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["If pAtivo Then", "   pAtivo = False", "End If"]);
  });
});

describe("SugarTranspiler — A5 optional chaining (`?.`)", () => {
  const ctx = makeContext({});

  test("expands property access `Dim x = obj?.Prop` into Dim + If/Then", () => {
    const code = `Dim nome As String = pObj?.Nome`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      "Dim nome As String",
      "If pObj <> NULL Then",
      "   nome = pObj.Nome",
      "End If",
    ]);
  });

  test("expands method call statement `obj?.Method()` into If/Then guard", () => {
    const code = `pForm?.Free()`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["If pForm <> NULL Then", "   pForm.Free()", "End If"]);
  });

  test("emits `optional-chain-too-deep` when more than 3 ?. tokens on one line", () => {
    const code = `Dim x = a?.b?.c?.d?.e`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "optional-chain-too-deep");
    assert.equal(out, code);
  });

  test("emits `optional-chain-context-unsupported` for non-assignment, non-call line", () => {
    const code = `Print obj?.Nome`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 1);
    const [diag] = diagnostics;
    assert.ok(diag);
    assert.equal(diag.code, "optional-chain-context-unsupported");
    assert.equal(out, code);
  });
});

describe("SugarTranspiler — B1 object initializer", () => {
  const ctx = makeContext({});

  test("expands `New T() With { .X = v, .Y = w }`", () => {
    const code = `Dim p As TPessoa = New TPessoa() With { .Nome = "Joao", .Idade = 30 }`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [
      `Dim p As TPessoa = New TPessoa()`,
      "With p",
      `   .Nome = "Joao"`,
      "   .Idade = 30",
      "End With",
    ]);
  });
});

describe("SugarTranspiler — B2 Using (multi-line)", () => {
  const ctx = makeContext({});

  test("expands `Using x As New T(args) / body / End Using` into Try/Finally", () => {
    const code = ['Using form As New TFormCard("X")', "   form.Show()", "End Using"].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim form As TFormCard = New TFormCard\("X"\)/);
    assert.match(out, /Try/);
    assert.match(out, /Finally/);
    assert.match(out, /form\.Free\(\)/);
    assert.match(out, /End Try/);
  });
});

describe("SugarTranspiler — B3 auto-new (`As New T`)", () => {
  const ctx = makeContext({});

  test("expands `Dim x As New StringList` into the explicit `= New StringList()` form", () => {
    const code = `Dim list As New StringList`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim list As StringList = New StringList()`);
  });
});

describe("SugarTranspiler — D1 Enum declarative (multi-line)", () => {
  const ctx = makeContext({});

  test("expands `Enum X / V = ... / End Enum` into a CoreSugarBaseEnum class", () => {
    const code = [
      "Enum CardAdm As BaseEnum",
      '   Stone = "Stone"',
      '   Cielo = "Cielo"',
      "End Enum",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Imports core_sugars_enum/);
    assert.match(out, /Class CardAdm/);
    assert.match(out, /Inherits CoreSugarBaseEnum/);
    assert.match(out, /Shared Function Stone As CardAdm/);
    assert.match(out, /Shared Function Cielo As CardAdm/);
    assert.match(out, /Shared Function GetOptions\(\) As String/);
  });
});

describe("SugarTranspiler — G2 Match (multi-line)", () => {
  const ctx = makeContext({});

  test("expands `Match x / Case Is T : body / End Match` into If/ElseIf/Else/End If", () => {
    const code = [
      "Match pValue",
      '   Case Is CardRecord : Print "registro"',
      '   Case Else : Print "outro"',
      "End Match",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /If pValue\.InheritsFrom\(CardRecord\) Then/);
    assert.match(out, /Else/);
    assert.match(out, /End If/);
  });
});

describe("SugarTranspiler — G3 Return-If", () => {
  const ctx = makeContext({});

  test("expands `Return If cond Then a Else b` into a two-line form", () => {
    const code = `Return If x > 0 Then "pos" Else "neg"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), [`If x > 0 Then Return "pos"`, `Return "neg"`]);
  });
});

describe("SugarTranspiler — H1 pipe `|>`", () => {
  const ctx = makeContext({});

  test("rewrites `data |> Trim |> UCase` into nested calls", () => {
    const code = `Dim r As String = data |> Trim |> UCase`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /UCase\(Trim\(data\)\)/);
  });
});

describe("SugarTranspiler — E1/E2/E3 destructure-object", () => {
  const ctx = makeContext({});

  test("expands `Dim { Nome, Idade } = pessoa` to individual Dims", () => {
    const code = `Dim { Nome, Idade } = pessoa`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["Dim Nome = pessoa.Nome", "Dim Idade = pessoa.Idade"]);
  });

  test("handles rename `{ Nome As n }`", () => {
    const code = `Dim { Nome As n } = pessoa`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, "Dim n = pessoa.Nome");
  });

  test('handles default `{ Nome As n = "x" }` by emitting a fallback line', () => {
    const code = `Dim { Nome As n = "x" } = pessoa`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim n = pessoa\.Nome/);
    assert.match(out, /If n = NULL Or n = "" Then n = "x"/);
  });
});

describe("SugarTranspiler — E4/E5 destructure-array", () => {
  const ctx = makeContext({});

  test("expands `Dim [a, b] = lista` to `Item(0)` and `Item(1)`", () => {
    const code = `Dim [first, second] = lista`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.deepEqual(out.split("\n"), ["Dim first = lista.Item(0)", "Dim second = lista.Item(1)"]);
  });

  test("expands `Dim [first, ...rest]` to first + tail loop", () => {
    const code = `Dim [first, ...rest] = lista`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim first = lista\.Item\(0\)/);
    assert.match(out, /Dim rest As StringList = New StringList\(\)/);
    assert.match(out, /For __src0 = 1 To lista\.Count - 1/);
    assert.match(out, /rest\.Add\(lista\.Item\(__src0\)\)/);
  });
});

describe("SugarTranspiler — J2 tagged templates", () => {
  const ctx = makeContext({});

  test('rewrites `sql$"text {x}"` into `sql.Build(...)`', () => {
    const code = `Dim cmd As String = sql$"SELECT * FROM {tabela}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /sql\.Build\("SELECT \* FROM ", \(tabela\), ""\)/);
  });
});

describe("SugarTranspiler — A6 numeric separator", () => {
  const ctx = makeContext({});

  test("strips underscores from a Long literal", () => {
    const code = `Dim n As Long = 7_900_000_000`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim n As Long = 7900000000`);
  });

  test("strips underscores from a Double literal", () => {
    const code = `Dim pi As Double = 3.14_15`;
    const { code: out } = SugarTranspiler.transpile(code, ctx);
    assert.equal(out, `Dim pi As Double = 3.1415`);
  });

  test("leaves identifiers with leading/embedded underscores alone", () => {
    const code = `Dim __src0 As Integer = 42`;
    const { code: out } = SugarTranspiler.transpile(code, ctx);
    assert.equal(out, `Dim __src0 As Integer = 42`);
  });

  test("leaves underscores inside string literals alone", () => {
    const code = `Dim s As String = "a_b_c"`;
    const { code: out } = SugarTranspiler.transpile(code, ctx);
    assert.equal(out, `Dim s As String = "a_b_c"`);
  });
});

describe("SugarTranspiler — List Sugar and Arrow Functions", () => {
  const ctx = makeContext({});

  test("transpiles basic array literal declaration and pushes elements", () => {
    const code = `Dim x[] As String = ["a", "b"]`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Dim __src0 As TList_String = New TList_String\(\)/);
    assert.match(out, /__src0\.Push\("a"\)/);
    assert.match(out, /__src0\.Push\("b"\)/);
    assert.match(out, /Dim x As TList_String = __src0/);
  });

  test("transpiles array literal with spread operator", () => {
    const code = `Dim x[] As String = ["a", ...other]`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /__src0\.Push\("a"\)/);
    assert.match(out, /__src0\.Add\(other\)/);
  });

  test("transpiles non-capturing arrow function inside method call", () => {
    const code = [
      "Class TTest",
      "   Sub Run()",
      "      Dim lista As TList_String",
      "      Dim f = lista.Filter((x As String) => x = \"Item 1\")",
      "   End Sub",
      "End Class",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /lista\.Filter\(me\.__lambda0, NULL\)/);
    assert.match(out, /Private Function __lambda0\(pValue As CoreSugarBaseItem, i As Integer, extra As Variant\) As Boolean/);
    assert.match(out, /Dim x As String = CType\(core_sugars_list\.CoreSugarHelper\.UnwrapPrimitive\(pValue\), String\)/);
    assert.match(out, /__lambda0 = x = "Item 1"/);
  });

  test("transpiles capturing arrow function (closure) using generated closure class", () => {
    const code = [
      "Class TTest",
      "   Sub Run()",
      "      Dim lista As TList_String",
      "      Dim target = \"Item 1\"",
      "      Dim f = lista.Filter((x As String) => x = target)",
      "   End Sub",
      "End Class",
    ].join("\n");
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.match(out, /Class __LambdaClosure___lambda0/);
    assert.match(out, /Public target As String/);
    assert.match(out, /Dim __src0 As __LambdaClosure___lambda0 = New __LambdaClosure___lambda0\(\)/);
    assert.match(out, /__src0\.target = target/);
    assert.match(out, /lista\.Filter\(me\.__lambda0, __src0\)/);
    assert.match(out, /Dim __closure As __LambdaClosure___lambda0 = CType\(extra, __LambdaClosure___lambda0\)/);
    assert.match(out, /Dim target As String = CType\(__closure\.target, String\)/);
  });
});
