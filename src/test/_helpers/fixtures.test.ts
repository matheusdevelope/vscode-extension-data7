import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { loadExample, parseExampleHeader } from "./fixtures";

describe("loadExample / parseExampleHeader", () => {
  test("loads a real example from docs/exemple/ and parses its header", () => {
    const code = loadExample("sugar/for-each/01-stringlist-explicit-type.bas");
    const header = parseExampleHeader(code);
    assert.equal(header.example, "sugar/for-each/01-stringlist-explicit-type");
    assert.match(header.demonstrates, /For Each.*Collections\.StringList/);
    assert.deepEqual(header.diagnostics, []);
    assert.equal(header.transpiledTo, "sugar/for-each/_expected/01-stringlist-explicit-type.bas");
  });

  test("parses @diagnostics with a code@line entry", () => {
    const code = loadExample("diagnostics/unsupported-member/trigger.bas");
    const header = parseExampleHeader(code);
    assert.equal(header.diagnostics.length, 1);
    const first = header.diagnostics[0]!;
    assert.equal(first.code, "unsupported-member");
    assert.equal(first.line, 11);
  });

  test("parses multiple comma-separated @diagnostics entries", () => {
    const synthetic = [
      "' @example: synthetic/multi",
      "' @demonstrates: cenário hipotético com vários diagnósticos na mesma fonte",
      "' @diagnostics: missing-import@3, unknown-member@5",
      "'",
      "Dim x As Whatever",
    ].join("\n");
    const header = parseExampleHeader(synthetic);
    assert.equal(header.diagnostics.length, 2);
    assert.deepEqual(header.diagnostics[0], { code: "missing-import", line: 3 });
    assert.deepEqual(header.diagnostics[1], { code: "unknown-member", line: 5 });
  });

  test("treats @diagnostics: none as an empty list", () => {
    const synthetic = [
      "' @example: synthetic/clean",
      "' @demonstrates: caso sem nenhum diagnóstico",
      "' @diagnostics: none",
      "'",
      "Namespace mod_x",
      "End Namespace",
    ].join("\n");
    const header = parseExampleHeader(synthetic);
    assert.deepEqual(header.diagnostics, []);
  });

  test("throws when a required tag is missing", () => {
    const missingExample = [
      "' @demonstrates: tem demonstrates mas não tem example",
      "' @diagnostics: none",
      "",
    ].join("\n");
    assert.throws(() => parseExampleHeader(missingExample), /@example/);
  });

  test("throws when @diagnostics is malformed", () => {
    const malformed = [
      "' @example: synthetic/bad-diag",
      "' @demonstrates: header com tag inválida",
      "' @diagnostics: missing-import",
      "",
    ].join("\n");
    assert.throws(() => parseExampleHeader(malformed), /code@line/);
  });

  test("loadExample throws a descriptive error for unknown paths", () => {
    assert.throws(
      () => loadExample("does-not-exist/anywhere.bas"),
      /Example not found.*does-not-exist/,
    );
  });
});
