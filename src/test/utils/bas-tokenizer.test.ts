import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { tokenize, type Token } from "../../utils/bas-tokenizer";

function values(tokens: readonly Token[]): readonly { kind: Token["kind"]; value: string }[] {
  return tokens.map((t) => ({ kind: t.kind, value: t.value }));
}

describe("bas-tokenizer", () => {
  test("returns empty list for empty input", () => {
    assert.deepEqual([...tokenize("")], []);
  });

  test("classifies a bare identifier", () => {
    const t = tokenize("foo");
    assert.equal(t.length, 1);
    assert.equal(t[0]?.kind, "identifier");
    assert.equal(t[0]?.value, "foo");
    assert.equal(t[0]?.col, 0);
  });

  test("classifies a keyword case-insensitively", () => {
    assert.equal(tokenize("Dim")[0]?.kind, "keyword");
    assert.equal(tokenize("dim")[0]?.kind, "keyword");
    assert.equal(tokenize("DIM")[0]?.kind, "keyword");
  });

  test("tokenises a Dim declaration", () => {
    const t = tokenize("Dim x As Integer");
    // Type names (Integer, String, …) are NOT keywords — they are
    // identifiers because the language has no reserved type names.
    assert.deepEqual(values(t), [
      { kind: "keyword", value: "Dim" },
      { kind: "identifier", value: "x" },
      { kind: "keyword", value: "As" },
      { kind: "identifier", value: "Integer" },
    ]);
  });

  test("tokenises decimal and hex number literals", () => {
    const dec = tokenize("123 4.56 7e2 8E-1");
    const kinds = dec.map((t) => t.kind);
    assert.deepEqual(kinds, ["number", "number", "number", "number"]);
    const hex = tokenize("&H1F &hff");
    assert.deepEqual(
      hex.map((t) => t.value),
      ["&H1F", "&hff"],
    );
  });

  test('respects "\\"\\"" escape inside string literal', () => {
    const t = tokenize('Dim x = "a""b"');
    const s = t.find((x) => x.kind === "string");
    assert.ok(s);
    assert.equal(s?.value, '"a""b"');
  });

  test('recognises $"..." interpolation as a string token with prefix=$', () => {
    const t = tokenize('Dim x = $"hello {name}"');
    const s = t.find((x) => x.kind === "string");
    assert.ok(s && s.kind === "string");
    assert.equal(s.prefix, "$");
    assert.equal(s.value, '$"hello {name}"');
  });

  test("captures a single-quote comment as one comment token covering the tail", () => {
    const t = tokenize("Dim x = 1 ' my note");
    const last = t[t.length - 1];
    assert.equal(last?.kind, "comment");
    assert.equal(last?.value, "' my note");
  });

  test("classifies multi-character punctuation", () => {
    const t = tokenize("a <= b >= c <> d ??= e ||= f &&= g ?. h |> i");
    const kinds = t.filter((x) => x.kind === "punct").map((x) => x.value);
    assert.ok(kinds.includes("<="));
    assert.ok(kinds.includes(">="));
    assert.ok(kinds.includes("<>"));
    assert.ok(kinds.includes("??="));
    assert.ok(kinds.includes("||="));
    assert.ok(kinds.includes("&&="));
    assert.ok(kinds.includes("?."));
    assert.ok(kinds.includes("|>"));
  });

  test("tracks 0-based columns for every token", () => {
    const t = tokenize("Dim x = 1");
    assert.equal(t[0]?.col, 0);
    assert.equal(t[1]?.col, 4);
    assert.equal(t[2]?.col, 6);
    assert.equal(t[3]?.col, 8);
  });

  test("optionally includes whitespace tokens", () => {
    const t = tokenize("a b", { includeWhitespace: true });
    assert.deepEqual(values(t), [
      { kind: "identifier", value: "a" },
      { kind: "whitespace", value: " " },
      { kind: "identifier", value: "b" },
    ]);
  });

  test("tokenises a generic usage TList<Product>", () => {
    const t = tokenize("Dim a As TList<Product>");
    const kinds = t.map((x) => `${x.kind}:${x.value}`);
    assert.deepEqual(kinds, [
      "keyword:Dim",
      "identifier:a",
      "keyword:As",
      "identifier:TList",
      "punct:<",
      "identifier:Product",
      "punct:>",
    ]);
  });
});
