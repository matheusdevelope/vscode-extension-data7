import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test } from "node:test";
import { computeBuildSnapshot } from "../../project/build-snapshot";
import { withTempDir } from "../_helpers/temp-dir";

describe("BuildSnapshot", () => {
  test("changes when a source file changes", async () => {
    await withTempDir(async (tmp) => {
      seedSnapshotWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");

      const before = computeBuildSnapshot(tmp, outputFilePath);
      fs.writeFileSync(path.join(tmp, "src", "Principal.bas"), 'Print("changed")', "utf-8");
      const after = computeBuildSnapshot(tmp, outputFilePath);

      assert.notEqual(after.hash, before.hash);
    });
  });

  test("separates run builds that inject the VS Code logger", async () => {
    await withTempDir(async (tmp) => {
      seedSnapshotWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");

      const normal = computeBuildSnapshot(tmp, outputFilePath);
      const run = computeBuildSnapshot(tmp, outputFilePath, {
        vscodeLoggerFilePath: path.join(tmp, ".data7", "logs", "vscode-executor.log"),
      });

      assert.notEqual(run.hash, normal.hash);
    });
  });

  test("includes source directory topology used by virtual folders", async () => {
    await withTempDir(async (tmp) => {
      seedSnapshotWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");

      const before = computeBuildSnapshot(tmp, outputFilePath);
      fs.mkdirSync(path.join(tmp, "src", "Nested"));
      const after = computeBuildSnapshot(tmp, outputFilePath);

      assert.notEqual(after.hash, before.hash);
    });
  });
});

function seedSnapshotWorkspace(dir: string): void {
  fs.writeFileSync(path.join(dir, "data7.json"), "{}", "utf-8");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "Principal.bas"), 'Print("hello")', "utf-8");
}
