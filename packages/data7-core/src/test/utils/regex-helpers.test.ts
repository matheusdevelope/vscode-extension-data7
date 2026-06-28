import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { escapeForRegex } from "../../utils/regex-helpers";

describe("escapeForRegex", () => {
  test("passes through plain alphanumerics unchanged", () => {
    assert.equal(escapeForRegex("Greeter"), "Greeter");
    assert.equal(escapeForRegex("mod_a123"), "mod_a123");
  });

  test("escapes every regex metacharacter", () => {
    const meta = ".*+?^$|(){}[]\\";
    const escaped = escapeForRegex(meta);
    // Each metacharacter should be prefixed with a single backslash.
    for (const ch of meta) {
      assert.ok(escaped.includes("\\" + ch), `expected "\\${ch}" in "${escaped}"`);
    }
  });

  test("produced source compiles into a literal-matching RegExp", () => {
    const dangerous = "price = $1.99 (USD)";
    const rx = new RegExp(escapeForRegex(dangerous));
    assert.ok(rx.test(`prefix ${dangerous} suffix`));
    assert.ok(!rx.test("price = $199 USD"));
  });

  test("preserves empty string", () => {
    assert.equal(escapeForRegex(""), "");
  });
});
