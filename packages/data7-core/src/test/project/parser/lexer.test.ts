import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { tokenize, tokenizeLine } from "../../../project/parser/lexer";
import type { Token } from "../../../project/parser/token-types";

function kinds(tokens: readonly Token[]): readonly string[] {
  return tokens.map((t) => `${t.kind}:${t.value}`);
}

describe("parser/lexer", () => {
  test("empty input still yields an eof token", () => {
    const t = tokenize("");
    assert.equal(t.length, 1);
    assert.equal(t[0]?.kind, "eof");
  });

  test("tokenises a single line and terminates with eof", () => {
    const t = tokenize("Dim x = 1");
    assert.deepEqual(kinds(t), ["keyword:Dim", "identifier:x", "punct:=", "number:1", "eof:"]);
  });

  test("keeps numeric underscores inside expression delimiters with the number token", () => {
    const t = tokenize("value = grid.Cells[1, (grid.Row + 1_)]");

    assert.deepEqual(kinds(t), [
      "identifier:value",
      "punct:=",
      "identifier:grid",
      "punct:.",
      "identifier:Cells",
      "punct:[",
      "number:1",
      "punct:,",
      "punct:(",
      "identifier:grid",
      "punct:.",
      "identifier:Row",
      "punct:+",
      "number:1_",
      "punct:)",
      "punct:]",
      "eof:",
    ]);
  });

  test("keeps numeric separators inside a single number token", () => {
    const t = tokenize("Dim n = 1_000");

    assert.deepEqual(kinds(t), ["keyword:Dim", "identifier:n", "punct:=", "number:1_000", "eof:"]);
  });

  test("emits a newline token between lines", () => {
    const t = tokenize("a\nb");
    const ks = kinds(t);
    assert.ok(ks.some((k) => k.startsWith("newline:")));
    // First identifier on line 1, newline, then identifier on line 2.
    const a = t.find((x) => x.value === "a");
    const b = t.find((x) => x.value === "b");
    assert.equal(a?.loc.line, 1);
    assert.equal(b?.loc.line, 2);
  });

  test("uses 0-based columns and 1-based lines", () => {
    const t = tokenize("Dim x");
    const dim = t[0];
    assert.equal(dim?.loc.line, 1);
    assert.equal(dim?.loc.column, 0);
    const x = t[1];
    assert.equal(x?.loc.column, 4);
  });

  test("preserves comment tokens", () => {
    const t = tokenize("Dim x ' commentary");
    const hasComment = t.some((x) => x.kind === "comment" && x.value.startsWith("'"));
    assert.equal(hasComment, true);
  });

  test("handles a multi-line source with blank lines", () => {
    const src = "Class Foo\n\n   Dim x As Integer\nEnd Class";
    const t = tokenize(src);
    const newlineCount = t.filter((x) => x.kind === "newline").length;
    assert.equal(newlineCount, 3);
    const lastBeforeEof = t[t.length - 2];
    assert.equal(lastBeforeEof?.value, "Class");
  });

  test('preserves strings with "" escape', () => {
    const t = tokenize('Dim x = "a""b"');
    const s = t.find((x) => x.kind === "string");
    assert.equal(s?.value, '"a""b"');
  });

  test("handles CR/LF line endings the same as LF", () => {
    const lf = tokenize("a\nb");
    const crlf = tokenize("a\r\nb");
    assert.deepEqual(kinds(lf), kinds(crlf));
  });

  test("strips a leading UTF-8 BOM so Imports is a keyword at column 0", () => {
    const t = tokenize("\uFEFFImports Collections");
    const imports = t[0];
    assert.equal(imports?.kind, "keyword");
    assert.equal(imports?.value, "Imports");
    assert.equal(imports?.loc.column, 0);
    assert.ok(!t.some((tok) => tok.value === "\uFEFF"));
  });

  test("treats an in-line UTF-8 BOM as whitespace", () => {
    const line = tokenizeLine("\uFEFFImports Collections");
    assert.equal(line[0]?.kind, "keyword");
    assert.equal(line[0]?.value, "Imports");
    assert.ok(!line.some((tok) => tok.value === "\uFEFF"));
  });

  test("recognises generic punctuation `<` and `>`", () => {
    const t = tokenize("Dim a As TList<Product>");
    const punct = t.filter((x) => x.kind === "punct").map((x) => x.value);
    assert.ok(punct.includes("<"));
    assert.ok(punct.includes(">"));
  });
});
