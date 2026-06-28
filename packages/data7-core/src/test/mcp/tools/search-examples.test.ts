/**
 * Tests for the `data7_search_examples` MCP tool. Validates that we can
 * score and rank example entries by header content.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { listExamples, readExample } from "../../../mcp/resources/examples";

describe("data7_search_examples — index", () => {
  test("index loads at least 50 examples", () => {
    const all = listExamples();
    assert.ok(all.length >= 50, `expected ≥50 examples, got ${String(all.length)}`);
  });

  test("readExample returns content for a known example", () => {
    const entry = readExample("sugar/for-each/01-stringlist-explicit-type");
    assert.ok(entry, "expected the for-each canonical example");
    assert.ok(entry.content.includes("For Each"), "content should include the sugar trigger");
  });

  test("parsed header carries @demonstrates and @diagnostics", () => {
    const entry = readExample("sugar/for-each/01-stringlist-explicit-type");
    assert.ok(entry?.header, "header should parse");
    assert.match(entry.header.demonstrates, /For Each/i, "demonstrates should mention the feature");
    assert.equal(entry.header.diagnostics.length, 0);
  });

  test("readExample returns undefined for an unknown path", () => {
    const entry = readExample("does/not/exist");
    assert.equal(entry, undefined);
  });
});
