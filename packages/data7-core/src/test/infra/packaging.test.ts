import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "node:test";

describe("VSIX packaging", () => {
  test("ships the documentation tree required by the bundled MCP server", () => {
    const ignorePathCandidates = [
      path.resolve(__dirname, "../../../.vscodeignore"), // legacy
      path.resolve(__dirname, "../../../../data7-vscode/.vscodeignore"), // monorepo
    ];
    const ignorePath = ignorePathCandidates.find(fs.existsSync) ?? ignorePathCandidates[0]!;
    const ignoredPaths = fs.readFileSync(ignorePath, "utf-8");

    assert.equal(ignoredPaths.includes("docs/**"), false);
  });
});
