import "../../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  composeLineMaps,
  identityLineMap,
  shiftLineMapForInsert,
  Data7SourceMapBuilder,
  SourceMapLookup,
  resolveGeneratedPositionFromProjectXml,
  wordAtColumn,
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

describe("SourceMapLookup + project XML cursor", () => {
  test("findOriginal resolves module line to original file", () => {
    const lookup = SourceMapLookup.fromSourceMap({
      version: 1,
      generatedProjectFile: "out.7Proj",
      segments: [
        {
          generated: { moduleName: "mod_helper", line: 1, column: 0 },
          original: { fileUri: "file:///src/mod_helper.bas", line: 4, column: 0 },
        },
      ],
      symbols: [
        {
          originalName: "Run",
          generatedName: "a0",
          kind: "member",
          fileUri: "file:///src/mod_helper.bas",
        },
      ],
    });
    assert.deepEqual(lookup.findOriginal("mod_helper", 1), {
      fileUri: "file:///src/mod_helper.bas",
      line: 4,
      column: 0,
    });
    assert.equal(lookup.findSymbolByGeneratedName("a0")?.originalName, "Run");
  });

  test("resolveGeneratedPositionFromProjectXml maps Principal and module Codigo bodies", () => {
    const xml = `<?xml version="1.0"?>
<Projeto_Data7>
  <Codigo>
Namespace app
  Sub Main()
  End Sub
End Namespace
  </Codigo>
  <Modulos>
    <mod_helper>
      <Codigo>
Namespace helpers
  Class THelper
    Sub Run()
    End Sub
  End Class
End Namespace
      </Codigo>
    </mod_helper>
  </Modulos>
</Projeto_Data7>`;
    const lines = xml.split(/\r?\n/);
    const principalLine = lines.findIndex((line) => line.includes("Sub Main()"));
    const helperLine = lines.findIndex((line) => line.includes("Sub Run()"));
    assert.ok(principalLine >= 0);
    assert.ok(helperLine >= 0);

    const principal = resolveGeneratedPositionFromProjectXml(xml, principalLine, 2);
    assert.ok(principal);
    assert.equal(principal.moduleName, "Principal");
    assert.equal(principal.line, 1);
    assert.match(principal.lineText, /Sub Main/);

    const helper = resolveGeneratedPositionFromProjectXml(xml, helperLine, 4);
    assert.ok(helper);
    assert.equal(helper.moduleName, "mod_helper");
    assert.match(helper.lineText, /Sub Run/);
    assert.equal(wordAtColumn(helper.lineText, helper.lineText.indexOf("Run") + 1), "Run");
  });
});
