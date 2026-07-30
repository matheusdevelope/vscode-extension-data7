import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  composeLineMaps,
  identityLineMap,
  shiftLineMapForInsert,
  Data7SourceMapBuilder,
} from "../../../project/source-map";
import { minifyData7TextWithMap } from "../../../project/optimizer";

describe("source-map helpers", () => {
  test("composeLineMaps chains final→mid→original", () => {
    // mid→original
    const inner = [10, 11, 12];
    // final→mid (line 0 dropped)
    const outer = [1, 2];
    assert.deepEqual(composeLineMaps(outer, inner), [11, 12]);
  });

  test("shiftLineMapForInsert marks injected lines as -1", () => {
    const base = identityLineMap(3);
    assert.deepEqual(shiftLineMapForInsert(base, 1, 1), [0, -1, 1, 2]);
  });

  test("minify stripComments keeps identity line indices", () => {
    const code = "Sub Main()\r\n  ' comment\r\n  Dim x As Integer\r\nEnd Sub";
    const result = minifyData7TextWithMap(code, {
      enabled: true,
      stripComments: true,
      collapseWhitespace: false,
    });
    assert.equal(result.lineMap.length, code.split(/\r?\n/).length);
    assert.deepEqual(result.lineMap, [0, 1, 2, 3]);
  });

  test("minify collapseWhitespace drops blank lines from the map", () => {
    const code = "Sub Main()\r\n\r\n  Dim x As Integer\r\nEnd Sub";
    const result = minifyData7TextWithMap(code, {
      enabled: true,
      stripComments: false,
      collapseWhitespace: true,
    });
    assert.deepEqual(result.lineMap, [0, 2, 3]);
  });

  test("Data7SourceMapBuilder emits segments from a lineMap", () => {
    const builder = new Data7SourceMapBuilder();
    builder.addLineMappings("Principal", "a\nb\nc", "file:///src/Principal.bas", [0, 2, 4]);
    builder.addSymbol({
      originalName: "Touch",
      generatedName: "a",
      kind: "member",
      fileUri: "file:///src/Principal.bas",
    });
    const map = builder.build("out.7Proj");
    assert.equal(map.version, 1);
    assert.equal(map.segments.length, 3);
    assert.equal(map.segments[1]?.original.line, 2);
    assert.equal(map.symbols.length, 1);
  });
});
