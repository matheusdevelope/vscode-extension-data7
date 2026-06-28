/**
 * Tests for the `data7_get_canonical_example` MCP tool. Exercises the
 * `readExample` helper and the header parser.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { readExample } from "../../../mcp/resources/examples";

describe("data7_get_canonical_example — readExample", () => {
  test("returns content + header for sugar/ternary/01-dim-assignment", () => {
    const entry = readExample("sugar/ternary/01-dim-assignment");
    assert.ok(entry, "expected ternary canonical example");
    assert.ok(entry.header, "header should parse");
    assert.equal(entry.header.example, "sugar/ternary/01-dim-assignment");
  });

  test("accepts paths with or without the .bas extension", () => {
    const a = readExample("sugar/null-coalesce/01-dim-assignment");
    const b = readExample("sugar/null-coalesce/01-dim-assignment.bas");
    assert.ok(a, "without extension should resolve");
    assert.ok(b, "with extension should resolve");
    assert.equal(a.content, b.content);
  });

  test("returns undefined for unknown paths", () => {
    assert.equal(readExample("not-real/example"), undefined);
  });
});
