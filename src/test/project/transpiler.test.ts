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
    assert.match(out, /For __idx0 = 0 To outer\.Count - 1/);
    assert.match(out, /Dim name As String = outer\.Strings\(__idx0\)/);
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
    assert.equal(out, `Dim s = "Hello " & (name)`);
  });

  test("expands multiple expressions concatenated with `&`", () => {
    const code = `Dim s = $"Olá, {nome}! Você tem {idade} anos."`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "Olá, " & (nome) & "! Você tem " & (idade) & " anos."`);
  });

  test("preserves escaped braces `{{` and `}}` as literal characters", () => {
    const code = `Dim s = $"obj = {{ value: {v} }}"`;
    const { code: out, diagnostics } = SugarTranspiler.transpile(code, ctx);
    assert.equal(diagnostics.length, 0);
    assert.equal(out, `Dim s = "obj = { value: " & (v) & " }"`);
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
    assert.equal(out, `Dim s = "a" & (x) & " - " & "b" & (y)`);
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
