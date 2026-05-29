import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { parseChain, getChainPrefix } from "../../utils/chain-parser";

describe("parseChain", () => {
  test("parses a single identifier as root with no segments", () => {
    const r = parseChain("foo");
    assert.deepEqual(r, { root: "foo", segments: [] });
  });

  test("parses a property access chain", () => {
    const r = parseChain("a.b.c");
    assert.equal(r?.root, "a");
    assert.deepEqual(r?.segments, [
      { name: "b", hasCall: false },
      { name: "c", hasCall: false },
    ]);
  });

  test("parses a method call in the middle of a chain", () => {
    const r = parseChain("a.b().c");
    assert.equal(r?.root, "a");
    assert.deepEqual(r?.segments, [
      { name: "b", hasCall: true },
      { name: "c", hasCall: false },
    ]);
  });

  test("parses a deep chain with mixed calls and accesses", () => {
    const r = parseChain('me.Cell("Bandeira").Value.AsDefault');
    assert.equal(r?.root, "me");
    assert.deepEqual(r?.segments, [
      { name: "Cell", hasCall: true },
      { name: "Value", hasCall: false },
      { name: "AsDefault", hasCall: false },
    ]);
  });

  test("respects string literals inside argument lists", () => {
    const r = parseChain('obj.Method("a.b.c").Tail');
    assert.equal(r?.root, "obj");
    assert.deepEqual(r?.segments, [
      { name: "Method", hasCall: true },
      { name: "Tail", hasCall: false },
    ]);
  });

  test("handles nested parens in arguments", () => {
    const r = parseChain("obj.A(B(C(1))).D");
    assert.equal(r?.root, "obj");
    assert.deepEqual(r?.segments, [
      { name: "A", hasCall: true },
      { name: "D", hasCall: false },
    ]);
  });

  test("returns null on empty input", () => {
    assert.equal(parseChain(""), null);
    assert.equal(parseChain("   "), null);
  });

  test("returns null when starting with a non-identifier character", () => {
    assert.equal(parseChain(".foo"), null);
    assert.equal(parseChain("123abc"), null);
  });

  test("returns null on trailing dot with no segment name", () => {
    assert.equal(parseChain("a."), null);
    assert.equal(parseChain("a.b."), null);
  });

  test("returns null on unbalanced parens", () => {
    assert.equal(parseChain("a.b("), null);
  });

  test("stops at the first non-chain token without erroring", () => {
    // `+ 1` is not part of the chain — parser returns just the chain prefix.
    const r = parseChain("a.b + 1");
    assert.equal(r?.root, "a");
    assert.deepEqual(r?.segments, [{ name: "b", hasCall: false }]);
  });
});

describe("getChainPrefix", () => {
  test("extracts a simple property chain before a dot", () => {
    // me._list.Last.   (cursor after trailing dot)
    const line = "me._list.Last.";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.Last");
  });

  test("extracts a chain ending with a method call (parens)", () => {
    // me._list.Take(0).   (cursor after trailing dot)
    const line = "me._list.Take(0).";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.Take(0)");
  });

  test("extracts a chain ending with an empty method call", () => {
    // me._list.First().   (cursor after trailing dot)
    const line = "me._list.First().";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.First()");
  });

  test("extracts a chain with an indexed property call", () => {
    // me._list.Item(0).
    const line = "me._list.Item(0).";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.Item(0)");
  });

  test("extracts a chain with nested method calls in arguments", () => {
    // obj.A(B(C(1))).D.
    const line = "obj.A(B(C(1))).D.";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "obj.A(B(C(1))).D");
  });

  test("stops at operator boundaries (e.g., assignment)", () => {
    // x = me._list.Take(0).
    const line = "x = me._list.Take(0).";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.Take(0)");
  });

  test("handles leading whitespace (indentation)", () => {
    const line = "         me._list.Take(0).";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "me._list.Take(0)");
  });

  test("extracts a single identifier before a dot", () => {
    const line = "obj.";
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), "obj");
  });

  test("handles string arguments inside method calls", () => {
    const line = 'me.Cell("a.b").Value.';
    const dotIndex = line.lastIndexOf(".");
    assert.equal(getChainPrefix(line, dotIndex), 'me.Cell("a.b").Value');
  });
});
