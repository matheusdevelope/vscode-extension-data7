import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  extractSuppressedCodes,
  isSuppressed,
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
});
