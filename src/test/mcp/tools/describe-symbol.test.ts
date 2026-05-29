/**
 * Tests for the `data7_describe_symbol` MCP tool. Verifies the
 * inheritance-chain walk and the SYSTEM_SYMBOLS lookup paths consumed
 * by the tool. End-to-end JSON shape is verified by the integration
 * smoke test (`scripts/smoke-test-mcp.js`).
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  lookupSystemByContainer,
  lookupSystemByName,
  lookupSystemClassByName,
} from "../../../system-library";

describe("data7_describe_symbol — underlying lookups", () => {
  test("qualified-name resolution: Collections.StringList.Add", () => {
    const members = lookupSystemByContainer("StringList");
    const add = members.find((m) => m.name === "Add" && m.kind === "method");
    assert.ok(add, "Add method should exist");
    assert.equal(add.parameters?.[0]?.name, "pText");
  });

  test("inheritance chain: StringList → TStringList → TStrings → TPersistent", () => {
    const stringList = lookupSystemClassByName("StringList")[0];
    assert.ok(stringList, "StringList class missing");
    assert.equal(stringList.inheritsFrom, "Collections.TStringList");

    const tStringList = lookupSystemClassByName("TStringList")[0];
    assert.ok(tStringList, "TStringList missing");
    assert.equal(tStringList.inheritsFrom, "Collections.TStrings");

    const tStrings = lookupSystemClassByName("TStrings")[0];
    assert.ok(tStrings, "TStrings missing");
    assert.match(tStrings.inheritsFrom ?? "", /TPersistent/);
  });

  test("simple-name lookup falls through to the catalog", () => {
    const matches = lookupSystemByName("TFTP");
    assert.ok(matches.length > 0, "TFTP must exist");
    const cls = matches.find((s) => s.kind === "class");
    assert.equal(cls?.containerName, "Net");
  });
});
