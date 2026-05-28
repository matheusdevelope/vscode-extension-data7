import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { getNonNullVariablesAt } from "../../analysis/flow-analyzer";

describe("FlowAnalyzer — getNonNullVariablesAt", () => {
  test("narrows after `If x = NULL Then Return`", () => {
    const code = [
      "Sub Foo(pAdm As CardAdm)",
      "   If pAdm = NULL Then Return",
      "   pAdm.AsString",
      "End Sub",
    ].join("\n");

    const facts = getNonNullVariablesAt(code, 2);
    assert.ok(facts.has("padm"));
  });

  test("narrows after `If x = NULL Then Throw New ...`", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      '   If item = NULL Then Throw New Exception("nil")',
      "   item.Valor",
      "End Sub",
    ].join("\n");

    assert.ok(getNonNullVariablesAt(code, 2).has("item"));
  });

  test("narrows after `If x = NULL Then Exit Sub`", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      "   If item = NULL Then Exit Sub",
      "   item.Valor",
      "End Sub",
    ].join("\n");

    assert.ok(getNonNullVariablesAt(code, 2).has("item"));
  });

  test("narrows inside `If x <> NULL Then ... End If` block", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      "   If item <> NULL Then",
      "      item.Valor",
      "   End If",
      "End Sub",
    ].join("\n");

    assert.ok(getNonNullVariablesAt(code, 2).has("item"));
  });

  test("drops the fact after `End If`", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      "   If item <> NULL Then",
      "      item.Valor",
      "   End If",
      "   item.Valor", // line 4 — fact no longer holds
      "End Sub",
    ].join("\n");

    assert.ok(!getNonNullVariablesAt(code, 4).has("item"));
  });

  test("drops the fact when an `Else` branch follows", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      "   If item <> NULL Then",
      "      Print item.Valor",
      "   Else",
      "      Print 0", // line 4 — we are now in the Else branch
      "   End If",
      "End Sub",
    ].join("\n");

    assert.ok(!getNonNullVariablesAt(code, 4).has("item"));
  });

  test("does not narrow when the comparison is not against NULL", () => {
    const code = [
      "Sub Foo(item As CardRecord)",
      '   If item.Nome = "X" Then',
      "      Print 1",
      "   End If",
      "End Sub",
    ].join("\n");

    assert.equal(getNonNullVariablesAt(code, 2).size, 0);
  });

  test("returns an empty set when there is no guard at all", () => {
    const code = ["Sub Foo(item As CardRecord)", "   Print item.Nome", "End Sub"].join("\n");
    assert.equal(getNonNullVariablesAt(code, 1).size, 0);
  });

  test("works with multiple disjoint guards", () => {
    const code = [
      "Sub Foo(a As X, b As Y)",
      "   If a = NULL Then Return",
      "   If b = NULL Then Return",
      "   a.Do()",
      "   b.Do()",
      "End Sub",
    ].join("\n");

    const facts = getNonNullVariablesAt(code, 4);
    assert.ok(facts.has("a"));
    assert.ok(facts.has("b"));
  });
});
