import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { stripCommentsAndStrings, stripCommentsAndStringsLine } from "../../utils/code-stripper";

describe("stripCommentsAndStringsLine", () => {
  test("returns blanks for a line that is entirely a comment", () => {
    assert.equal(stripCommentsAndStringsLine("' just a comment"), "                ".padEnd(16));
    assert.equal(stripCommentsAndStringsLine("Rem all rem"), "           ".padEnd(11));
    assert.equal(stripCommentsAndStringsLine("rem"), "   ");
  });

  test("preserves identifiers outside strings/comments and column count", () => {
    const input = 'Dim greeter As String = "hi"';
    const out = stripCommentsAndStringsLine(input);
    assert.equal(out.length, input.length, "must preserve column count");
    // The identifier `greeter` survives.
    assert.ok(out.includes("greeter"));
    // The string body `hi` becomes spaces.
    assert.ok(!out.includes("hi"));
    // The quotes themselves are kept so callers can still see "where" a literal was.
    assert.ok(out.includes('"  "'));
  });

  test('handles embedded "" escape correctly', () => {
    const input = 'Dim s = "embedded ""quote"" here"';
    const out = stripCommentsAndStringsLine(input);
    assert.equal(out.length, input.length);
    // The identifier `s` survives, but the entire string body (including the
    // escaped section) becomes spaces.
    assert.ok(out.includes("s "));
    assert.ok(!out.includes("embedded"));
    assert.ok(!out.includes("quote"));
  });

  test("treats a single quote inside a string as content, not as a comment", () => {
    const input = 'msg = "isn\'t this nice" ' + "' real comment";
    const out = stripCommentsAndStringsLine(input);
    assert.equal(out.length, input.length);
    // `msg` survives.
    assert.ok(out.includes("msg"));
    // The string body is gone.
    assert.ok(!out.includes("nice"));
    // The trailing real comment is also gone.
    assert.ok(!out.includes("real comment"));
  });

  test("blank-pads the comment tail outside strings", () => {
    const input = "x = 1 " + "' tail";
    const out = stripCommentsAndStringsLine(input);
    assert.equal(out.length, input.length);
    assert.ok(out.includes("x = 1"));
    assert.ok(!out.includes("tail"));
  });
});

describe("stripCommentsAndStrings (multi-line)", () => {
  test("processes every line independently and re-joins with \\n", () => {
    const input = 'Line1\nLine2 \'comment\n"strung"';
    const out = stripCommentsAndStrings(input);
    const lines = out.split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[0].includes("Line1"));
    assert.ok(lines[1].includes("Line2 "));
    assert.ok(!lines[1].includes("comment"));
    // The third line had only a literal — its quotes stay but the body is blank.
    assert.ok(lines[2].startsWith('"'));
    assert.ok(!lines[2].includes("strung"));
  });
});
