/**
 * Tests for the `data7_list_sugar` MCP tool. Verifies that the sugar
 * catalog can be enumerated from `docs/exemple/sugar/` and that each
 * sugar's first example has a parseable header.
 */
import "../../_setup/global-hooks";

import * as fs from "fs";
import * as path from "path";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { listExamples } from "../../../mcp/resources/examples";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SUGAR_ROOT = path.join(REPO_ROOT, "docs", "exemple", "sugar");

describe("data7_list_sugar — discovery", () => {
  test("sugar folder contains at least 20 subfolders", () => {
    const folders = fs
      .readdirSync(SUGAR_ROOT)
      .filter((entry) => fs.statSync(path.join(SUGAR_ROOT, entry)).isDirectory());
    assert.ok(folders.length >= 20, `expected ≥20 sugars, got ${String(folders.length)}`);
  });

  test("at least 5 sugars carry a _expected/ sibling", () => {
    const folders = fs
      .readdirSync(SUGAR_ROOT)
      .filter((entry) => fs.statSync(path.join(SUGAR_ROOT, entry)).isDirectory());
    const withExpected = folders.filter((entry) =>
      fs.existsSync(path.join(SUGAR_ROOT, entry, "_expected")),
    );
    assert.ok(withExpected.length >= 5, "expected several sugars with native expansions");
  });

  test("for-each sugar has the canonical 01- example with parseable header", () => {
    const forEach = listExamples().find(
      (e) => e.relativePath === "sugar/for-each/01-stringlist-explicit-type",
    );
    assert.ok(forEach, "for-each canonical example missing");
    assert.ok(forEach.header, "header should parse");
    assert.equal(forEach.header.diagnostics.length, 0);
  });
});
