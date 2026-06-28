import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as path from "path";
import { isSafeSegment, safeJoinInside } from "../../utils/path-safety";

describe("safeJoinInside", () => {
  const root = path.resolve("/tmp/data7-root");

  test("returns a normalised path inside the root for simple segments", () => {
    const result = safeJoinInside(root, "modules", "mod_a.bas");
    assert.equal(result, path.resolve(root, "modules", "mod_a.bas"));
  });

  test('throws when the candidate escapes the root via ".."', () => {
    assert.throws(() => safeJoinInside(root, "..", "outside.txt"), /Caminho rejeitado/);
  });

  test("throws when an absolute candidate ends up outside the root", () => {
    assert.throws(() => safeJoinInside(root, "/etc/passwd"), /Caminho rejeitado/);
  });

  test("allows joining several safe segments together", () => {
    const result = safeJoinInside(root, "a", "b", "c", "d.bas");
    assert.equal(result, path.resolve(root, "a/b/c/d.bas"));
  });
});

describe("isSafeSegment", () => {
  test("accepts plain identifiers", () => {
    assert.ok(isSafeSegment("mod_a"));
    assert.ok(isSafeSegment("Form1.bas"));
    assert.ok(isSafeSegment("My-Module_v2.7Proj"));
  });

  test("rejects path traversal tokens", () => {
    assert.ok(!isSafeSegment("."));
    assert.ok(!isSafeSegment(".."));
  });

  test("rejects names containing path separators", () => {
    assert.ok(!isSafeSegment("a/b"));
    assert.ok(!isSafeSegment("a\\b"));
  });

  test("rejects empty / overlong names", () => {
    assert.ok(!isSafeSegment(""));
    assert.ok(!isSafeSegment("x".repeat(256)));
  });

  test("rejects reserved Windows characters", () => {
    for (const ch of '<>:"|?*') {
      assert.ok(!isSafeSegment(`bad${ch}name`), `expected to reject "${ch}"`);
    }
  });

  test("rejects names containing NUL bytes", () => {
    assert.ok(!isSafeSegment("hello\0world"));
  });
});
