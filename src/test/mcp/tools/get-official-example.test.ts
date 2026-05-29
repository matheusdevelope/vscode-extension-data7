/**
 * Tests for the `data7_get_official_example` MCP tool. Verifies the
 * articles.json lookup path produced by M1.5.
 */
import "../../_setup/global-hooks";

import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { findOfficialArticle, listOfficialArticles } from "../../../mcp/resources/official";

describe("data7_get_official_example — articles.json bundle", () => {
  test("bundle loaded with at least 100 API-reference articles", () => {
    const all = listOfficialArticles();
    assert.ok(all.length >= 100, `expected ≥100 articles, got ${String(all.length)}`);
  });

  test("Collections.StringList.Add carries signature + description + example", () => {
    const article = findOfficialArticle("Collections.StringList.Add");
    assert.ok(article, "expected article for StringList.Add");
    assert.ok(article.signature, "signature should be extracted");
    assert.match(article.signature, /UnicodeString/);
    assert.ok(article.description?.length, "description should be populated");
    assert.ok(article.example?.length, "example code should be populated");
  });

  test("lookup is case-insensitive", () => {
    const upper = findOfficialArticle("COLLECTIONS.STRINGLIST.ADD");
    const lower = findOfficialArticle("collections.stringlist.add");
    assert.ok(upper && lower);
    assert.equal(upper.qualifiedName, lower.qualifiedName);
  });

  test("returns undefined for unknown qualified names", () => {
    assert.equal(findOfficialArticle("Bogus.Thing.That.Doesnt.Exist"), undefined);
  });
});
