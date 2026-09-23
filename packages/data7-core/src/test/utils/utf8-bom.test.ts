import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { stripUtf8Bom } from "../../utils/utf8-bom";

describe("stripUtf8Bom", () => {
  test("removes a leading U+FEFF and leaves the rest intact", () => {
    assert.equal(stripUtf8Bom("\uFEFFImports Collections"), "Imports Collections");
  });

  test("leaves text without a BOM unchanged", () => {
    assert.equal(stripUtf8Bom("Imports Collections"), "Imports Collections");
  });

  test("does not strip U+FEFF after the first character", () => {
    assert.equal(stripUtf8Bom("A\uFEFFB"), "A\uFEFFB");
  });
});
