import "../_setup/global-hooks";
import { describe, test, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as vscode from "vscode";
import { D7ProjectSourceMapDefinitionProvider } from "../../providers/source-map-definition-provider";
import { D7ProjectSourceMapHoverProvider } from "../../providers/source-map-hover-provider";
import { clearSourceMapLookupCache } from "../../providers/source-map-provider-context";
import { createMockDoc, noopToken, pos } from "../_helpers/mock-doc";

function writeTempProject(): { dir: string; projectPath: string; basUri: string; xml: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-sourcemap-"));
  const projectPath = path.join(dir, "Demo.7Proj");
  const basPath = path.join(dir, "src", "mod_helper.bas");
  fs.mkdirSync(path.dirname(basPath), { recursive: true });
  fs.writeFileSync(basPath, "Namespace helpers\n  Sub Run()\n  End Sub\nEnd Namespace\n", "utf-8");
  const basUri = pathToFileURL(basPath).toString();

  const xml = `<?xml version="1.0"?>
<Projeto_Data7>
  <Codigo>
Namespace app
End Namespace
  </Codigo>
  <Modulos>
    <mod_helper>
      <Codigo>
Namespace helpers
  Sub a0()
  End Sub
End Namespace
      </Codigo>
    </mod_helper>
  </Modulos>
</Projeto_Data7>`;
  fs.writeFileSync(projectPath, xml, "utf-8");

  const map = {
    version: 1,
    generatedProjectFile: projectPath,
    segments: [
      {
        generated: { moduleName: "mod_helper", line: 1, column: 0 },
        original: { fileUri: basUri, line: 1, column: 0 },
      },
    ],
    symbols: [
      {
        originalName: "Run",
        generatedName: "a0",
        kind: "member",
        fileUri: basUri,
      },
    ],
  };
  fs.writeFileSync(`${projectPath}.map.json`, JSON.stringify(map, null, 2), "utf-8");

  return { dir, projectPath, basUri, xml };
}

describe("D7ProjectSourceMapDefinitionProvider", () => {
  beforeEach(() => {
    clearSourceMapLookupCache();
  });

  test("jumps to original .bas line from generated Codigo", () => {
    const { projectPath, basUri, xml } = writeTempProject();
    const doc = createMockDoc(pathToFileURL(projectPath).toString(), xml, {
      languageId: "data7project",
    });
    const lines = xml.split(/\r?\n/);
    const targetLine = lines.findIndex((line) => line.includes("Sub a0()"));
    assert.ok(targetLine >= 0);

    const provider = new D7ProjectSourceMapDefinitionProvider();
    const result = provider.provideDefinition(doc, pos(targetLine, 6), noopToken);
    assert.ok(Array.isArray(result));
    const link = (result as vscode.LocationLink[])[0];
    assert.ok(link);
    assert.equal(link.targetUri.toString(), basUri);
    assert.equal(link.targetRange.start.line, 1);
  });
});

describe("D7ProjectSourceMapHoverProvider", () => {
  beforeEach(() => {
    clearSourceMapLookupCache();
  });

  test("shows original path and demangled symbol", () => {
    const { projectPath, xml } = writeTempProject();
    const doc = createMockDoc(pathToFileURL(projectPath).toString(), xml, {
      languageId: "data7project",
    });
    const lines = xml.split(/\r?\n/);
    const targetLine = lines.findIndex((line) => line.includes("Sub a0()"));
    const col = (lines[targetLine] ?? "").indexOf("a0") + 1;

    const provider = new D7ProjectSourceMapHoverProvider();
    const hover = provider.provideHover(doc, pos(targetLine, col), noopToken) as vscode.Hover;
    assert.ok(hover);
    const parts = Array.isArray(hover.contents) ? hover.contents : [hover.contents];
    const text = parts
      .map((part) =>
        typeof part === "string" ? part : String((part as vscode.MarkdownString).value),
      )
      .join("\n");
    assert.match(text, /Origem:/);
    assert.match(text, /a0/);
    assert.match(text, /Run/);
  });
});
