import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { detectEnumerable } from "../../analysis/enumerable-detector";
import type { SymbolInfo } from "../../analysis/symbol-indexer";

function mkProperty(name: string, type: string): SymbolInfo {
  return {
    name,
    kind: "property",
    type,
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "test://fixture",
    containerName: "TFixture",
  };
}

function mkIndexerMethod(name: string, elementType: string): SymbolInfo {
  return {
    name,
    kind: "method",
    type: elementType,
    isShared: false,
    isPrivate: false,
    parameters: [{ name: "pIndex", type: "Integer", isByRef: false, isOptional: false }],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "test://fixture",
    containerName: "TFixture",
  };
}

describe("detectEnumerable", () => {
  test("returns the Count + indexer pair for a StringList-shaped type", () => {
    const members: SymbolInfo[] = [
      mkProperty("Count", "Integer"),
      mkIndexerMethod("Strings", "String"),
    ];
    const info = detectEnumerable("TFixture", () => members);
    assert.ok(info);
    assert.equal(info.countMember, "Count");
    assert.equal(info.indexerMember, "Strings");
    assert.equal(info.elementType, "String");
  });

  test("returns undefined when the type has no Count property", () => {
    const members: SymbolInfo[] = [mkIndexerMethod("Strings", "String")];
    const info = detectEnumerable("TFixture", () => members);
    assert.equal(info, undefined);
  });

  test("returns undefined when the type has no integer-indexed accessor", () => {
    const members: SymbolInfo[] = [mkProperty("Count", "Integer"), mkProperty("Text", "String")];
    const info = detectEnumerable("TFixture", () => members);
    assert.equal(info, undefined);
  });

  test("picks the indexer whose return type matches the explicit element type hint", () => {
    const members: SymbolInfo[] = [
      mkProperty("Count", "Integer"),
      mkIndexerMethod("Strings", "String"),
      mkIndexerMethod("Objects", "TObject"),
    ];
    const info = detectEnumerable("TFixture", () => members, "TObject");
    assert.ok(info);
    assert.equal(info.indexerMember, "Objects");
    assert.equal(info.elementType, "TObject");
  });

  test("prefers conventional names (Items > Strings > Objects) when no hint is given", () => {
    const members: SymbolInfo[] = [
      mkProperty("Count", "Integer"),
      mkIndexerMethod("Objects", "TObject"),
      mkIndexerMethod("Strings", "String"),
      mkIndexerMethod("Items", "TWidget"),
    ];
    const info = detectEnumerable("TFixture", () => members);
    assert.ok(info);
    assert.equal(info.indexerMember, "Items");
    assert.equal(info.elementType, "TWidget");
  });

  test("ignores indexers that return Void", () => {
    const voidIndexer: SymbolInfo = {
      ...mkIndexerMethod("DoStuff", "Void"),
    };
    const members: SymbolInfo[] = [mkProperty("Count", "Integer"), voidIndexer];
    const info = detectEnumerable("TFixture", () => members);
    assert.equal(info, undefined);
  });

  test("ignores indexers whose single parameter is not Integer", () => {
    const stringIndexer: SymbolInfo = {
      ...mkIndexerMethod("ByName", "TObject"),
      parameters: [{ name: "pName", type: "String", isByRef: false, isOptional: false }],
    };
    const members: SymbolInfo[] = [mkProperty("Count", "Integer"), stringIndexer];
    const info = detectEnumerable("TFixture", () => members);
    assert.equal(info, undefined);
  });
});
