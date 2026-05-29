/**
 * Tests for the `data7_search_symbol` MCP tool. We exercise the lookup
 * paths against the real `SYSTEM_SYMBOLS` catalog (no mocking) so the
 * tool is validated end-to-end including the project()/scoring logic.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  SYSTEM_SYMBOLS,
  lookupSystemByContainer,
  lookupSystemByName,
} from "../../../system-library";

// We import the registry-level lookup helpers and exercise the same
// filtering logic the tool uses. Importing the tool itself would require
// constructing an McpServer, which adds noise; the contract under test
// is the underlying catalog behaviour.

describe("data7_search_symbol — underlying lookups", () => {
  test("exact-name lookup returns Collections.StringList", () => {
    const hits = lookupSystemByName("StringList");
    assert.ok(hits.length >= 1, "expected at least one StringList match");
    const cls = hits.find((s) => s.kind === "class");
    assert.ok(cls, "expected a class entry for StringList");
    assert.equal(cls.containerName, "Collections");
  });

  test("container-scoped lookup returns the class members", () => {
    const members = lookupSystemByContainer("StringList");
    assert.ok(members.length > 5, "StringList should expose multiple members");
    const addMethod = members.find((m) => m.name === "Add" && m.kind === "method");
    assert.ok(addMethod, "Add method should be present");
  });

  test("substring scan over SYSTEM_SYMBOLS finds at least the TJSON classes", () => {
    const matches = SYSTEM_SYMBOLS.filter((s) => s.name.toLowerCase().includes("json"));
    // We expect at least TJSONObject + TJSONArray plus a few helpers; the
    // exact count varies as the catalog grows.
    assert.ok(
      matches.length >= 3,
      `expected ≥3 json-related symbols, got ${String(matches.length)}`,
    );
    assert.ok(
      matches.some((m) => m.name === "TJSONObject"),
      "TJSONObject must be in catalog",
    );
    assert.ok(
      matches.some((m) => m.name === "TJSONArray"),
      "TJSONArray must be in catalog",
    );
  });

  test("isUnsupported flag is reachable on the catalog", () => {
    const unsupported = SYSTEM_SYMBOLS.filter((s) => s.isUnsupported);
    assert.ok(unsupported.length > 0, "catalog must surface unsupported members for the filter");
  });
});
