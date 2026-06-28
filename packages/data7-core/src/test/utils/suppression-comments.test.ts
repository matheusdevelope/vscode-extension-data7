import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  extractSuppressedCodes,
  isSuppressed,
  getCommentStartIndex,
  type SuppressionTarget,
} from "../../utils/suppression-comments";

describe("suppression-comments", () => {
  describe("extractSuppressedCodes", () => {
    test("returns an empty map when there are no directives", () => {
      const result = extractSuppressedCodes("Dim x As Integer\nDim y As String\n");
      assert.equal(result.size, 0);
    });

    test("disable-line without codes suppresses ALL codes on that line", () => {
      const code = `Dim x As Integer ' data7:disable-line\n`;
      const result = extractSuppressedCodes(code);
      assert.equal(result.get(0), "*");
    });

    test("disable-line with a single code suppresses only that code", () => {
      const code = `g.PopupMenu = Nothing ' data7:disable-line unsupported-member\n`;
      const result = extractSuppressedCodes(code);
      const target = result.get(0)!;
      assert.notEqual(target, "*");
      assert.ok((target as ReadonlySet<string>).has("unsupported-member"));
    });

    test("disable-line accepts a comma-separated list of codes (case-insensitive)", () => {
      const code = `x = y ' data7:disable-line missing-import,UNUSED-IMPORT\n`;
      const target = extractSuppressedCodes(code).get(0) as ReadonlySet<string>;
      assert.ok(target.has("missing-import"));
      assert.ok(target.has("unused-import"));
    });

    test("disable-next-line attaches the directive to the next non-blank line", () => {
      const code = [
        `' data7:disable-next-line unsupported-member`,
        ``,
        `   `,
        `g.PopupMenu = Nothing`,
      ].join("\n");
      const result = extractSuppressedCodes(code);
      assert.equal(result.has(0), false);
      const target = result.get(3) as ReadonlySet<string>;
      assert.ok(target?.has("unsupported-member"));
    });

    test("multiple directives on the same line merge their code sets", () => {
      const code = `x = 1 ' data7:disable-line missing-import\n`;
      const result = extractSuppressedCodes(code);
      const target = result.get(0) as ReadonlySet<string>;
      assert.ok(target.has("missing-import"));
    });

    test("REM-style comment is also accepted", () => {
      const code = `Dim x As Integer REM data7:disable-line\n`;
      const result = extractSuppressedCodes(code);
      assert.equal(result.get(0), "*");
    });

    test("disable without codes suppresses ALL codes on every line of the file", () => {
      const code = `' data7:disable\nDim x As Integer\nDim y As String\n`;
      const result = extractSuppressedCodes(code);
      assert.equal(result.get(0), "*");
      assert.equal(result.get(1), "*");
      assert.equal(result.get(2), "*");
    });

    test("disable with codes suppresses only those codes on every line of the file", () => {
      const code = `' data7:disable missing-import,unused-import\nDim x As Integer\nDim y As String\n`;
      const result = extractSuppressedCodes(code);
      const target0 = result.get(0) as ReadonlySet<string>;
      const target1 = result.get(1) as ReadonlySet<string>;
      assert.ok(target0.has("missing-import"));
      assert.ok(target0.has("unused-import"));
      assert.ok(target1.has("missing-import"));
      assert.ok(target1.has("unused-import"));
      assert.equal(target0.has("other-code"), false);
    });
  });

  describe("isSuppressed", () => {
    test("returns true for a wildcard suppression regardless of code", () => {
      const map = new Map<number, SuppressionTarget>([[3, "*"]]);
      assert.equal(isSuppressed(map, 3, "missing-import"), true);
      assert.equal(isSuppressed(map, 3, "unsupported-member"), true);
    });

    test("matches only the targeted code when the suppression is specific", () => {
      const map = new Map<number, SuppressionTarget>([[3, new Set(["unsupported-member"])]]);
      assert.equal(isSuppressed(map, 3, "unsupported-member"), true);
      assert.equal(isSuppressed(map, 3, "missing-import"), false);
    });

    test("returns false for lines without suppressions", () => {
      const map = new Map<number, SuppressionTarget>();
      assert.equal(isSuppressed(map, 0, "missing-import"), false);
    });
  });

  describe("getCommentStartIndex", () => {
    test("returns -1 when there is no comment", () => {
      assert.equal(getCommentStartIndex("Dim x = 123"), -1);
    });

    test("returns index of comment outside strings", () => {
      assert.equal(getCommentStartIndex("Dim x = 123 ' my comment"), 12);
    });

    test("ignores single quotes inside double-quoted string literals", () => {
      assert.equal(getCommentStartIndex("IF pValue = \"''\""), -1);
      assert.equal(getCommentStartIndex("IF pValue = \"'\" ' my comment"), 16);
    });

    test("handles escaped quotes in strings correctly", () => {
      assert.equal(getCommentStartIndex('x = "escaped "" quote \' here" \' comment'), 30);
    });
  });
});
