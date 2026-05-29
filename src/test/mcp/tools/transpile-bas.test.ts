/**
 * Tests for the `data7_transpile_bas` MCP tool. Exercises the pure
 * `SugarTranspiler.transpile()` integration so the smoke layer for the
 * actual tool wiring is covered by `smoke-test-mcp.js`.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { SugarTranspiler } from "../../../project/transpiler";

const NOOP_CTX = { detectEnumerable: () => undefined };

describe("data7_transpile_bas — SugarTranspiler integration", () => {
  test("ternary in Dim RHS expands to If/Then/Else", () => {
    const input = 'Dim status As String = 1 > 0 ? "pos" : "neg"';
    const result = SugarTranspiler.transpile(input, NOOP_CTX);
    assert.ok(result.code.includes("If "), "expected If header in expansion");
    assert.ok(result.code.includes("Else"), "expected Else branch");
    assert.ok(result.code.includes("End If"), "expected End If");
  });

  test("string interpolation expands to & concatenations", () => {
    const input = 'Dim s As String = $"Hello {name}"';
    const result = SugarTranspiler.transpile(input, NOOP_CTX);
    assert.ok(result.code.includes("&"), "expected & operator after expansion");
    assert.ok(!result.code.includes('$"'), "expected dollar-quoted string to be gone");
  });

  test("non-sugared code is preserved verbatim", () => {
    const input = "Dim x As Integer = 42";
    const result = SugarTranspiler.transpile(input, NOOP_CTX);
    assert.equal(result.code.trim(), input.trim());
    assert.equal(result.diagnostics.length, 0);
  });

  test("non-enumerable For Each emits diagnostic", () => {
    const input = ["Dim x As Variant", "For Each item In x", "Next"].join("\n");
    const result = SugarTranspiler.transpile(input, NOOP_CTX);
    const nonEnum = result.diagnostics.find((d) => d.code === "not-enumerable");
    assert.ok(nonEnum, "expected a not-enumerable diagnostic");
  });
});
