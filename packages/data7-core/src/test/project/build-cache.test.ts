import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import { BuildCache } from "../../project/build-cache";
import { Builder } from "../../project/builder";
import { withTempDir } from "../_helpers/temp-dir";

describe("BuildCache", () => {
  const originalBuildProject = Builder.buildProject;

  afterEach(() => {
    Builder.buildProject = originalBuildProject;
  });

  test("skips the builder when inputs and output are unchanged", async () => {
    await withTempDir(async (tmp) => {
      seedCacheWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");
      let buildCalls = 0;
      Builder.buildProject = (_workspaceDir: string, output: string): string => {
        buildCalls++;
        fs.writeFileSync(output, `<xml>${buildCalls}</xml>`, "utf-8");
        return output;
      };

      const first = BuildCache.ensureProjectBuilt(tmp, outputFilePath);
      const second = BuildCache.ensureProjectBuilt(tmp, outputFilePath);

      assert.equal(first.skipped, false);
      assert.equal(second.skipped, true);
      assert.equal(buildCalls, 1);
    });
  });

  test("rebuilds when a source file changes", async () => {
    await withTempDir(async (tmp) => {
      seedCacheWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");
      let buildCalls = 0;
      Builder.buildProject = (_workspaceDir: string, output: string): string => {
        buildCalls++;
        fs.writeFileSync(output, `<xml>${buildCalls}</xml>`, "utf-8");
        return output;
      };

      BuildCache.ensureProjectBuilt(tmp, outputFilePath);
      fs.writeFileSync(path.join(tmp, "src", "Principal.bas"), 'Print("changed")', "utf-8");
      const result = BuildCache.ensureProjectBuilt(tmp, outputFilePath);

      assert.equal(result.skipped, false);
      assert.equal(buildCalls, 2);
    });
  });

  test("rebuilds when the existing .7Proj output is modified externally", async () => {
    await withTempDir(async (tmp) => {
      seedCacheWorkspace(tmp);
      const outputFilePath = path.join(tmp, "Project.7Proj");
      let buildCalls = 0;
      Builder.buildProject = (_workspaceDir: string, output: string): string => {
        buildCalls++;
        fs.writeFileSync(output, `<xml>${buildCalls}</xml>`, "utf-8");
        return output;
      };

      BuildCache.ensureProjectBuilt(tmp, outputFilePath);
      fs.writeFileSync(outputFilePath, "<xml>external</xml>", "utf-8");
      const result = BuildCache.ensureProjectBuilt(tmp, outputFilePath);

      assert.equal(result.skipped, false);
      assert.equal(buildCalls, 2);
    });
  });

  test("keeps independent manifests for standard and run outputs", async () => {
    await withTempDir(async (tmp) => {
      seedCacheWorkspace(tmp);
      const standardOutput = path.join(tmp, "Project.7Proj");
      const runOutput = path.join(tmp, ".data7", "run", "Project.run.7Proj");
      let buildCalls = 0;
      Builder.buildProject = (_workspaceDir: string, output: string): string => {
        buildCalls++;
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, `<xml>${buildCalls}</xml>`, "utf-8");
        return output;
      };

      const standardCold = BuildCache.ensureProjectBuilt(tmp, standardOutput);
      const runCold = BuildCache.ensureProjectBuilt(tmp, runOutput, {
        vscodeLoggerFilePath: path.join(tmp, ".data7", "logs", "vscode-executor.log"),
      });
      const standardWarm = BuildCache.ensureProjectBuilt(tmp, standardOutput);
      const runWarm = BuildCache.ensureProjectBuilt(tmp, runOutput, {
        vscodeLoggerFilePath: path.join(tmp, ".data7", "logs", "vscode-executor.log"),
      });

      assert.equal(standardCold.skipped, false);
      assert.equal(runCold.skipped, false);
      assert.equal(standardWarm.skipped, true);
      assert.equal(runWarm.skipped, true);
      assert.equal(buildCalls, 2);
    });
  });
});

function seedCacheWorkspace(dir: string): void {
  fs.writeFileSync(path.join(dir, "data7.json"), "{}", "utf-8");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "Principal.bas"), 'Print("hello")', "utf-8");
}
