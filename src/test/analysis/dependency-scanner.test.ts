import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { DependencyScanner } from "../../analysis/dependency-scanner";
import { withTempDir } from "../_helpers/temp-dir";

describe("DependencyScanner", () => {
  describe("stripComments", () => {
    test("removes a trailing inline comment but keeps preceding code", () => {
      assert.equal(
        DependencyScanner.stripComments("Dim a As String ' this is a comment"),
        "Dim a As String ",
      );
    });

    test("returns an empty string for a whole-line comment", () => {
      assert.equal(DependencyScanner.stripComments("' whole line comment"), "");
    });

    test('returns an empty string for "Rem" comments', () => {
      assert.equal(DependencyScanner.stripComments("Rem whole line rem comment"), "");
    });

    test("passes plain code through unchanged", () => {
      assert.equal(DependencyScanner.stripComments("a = b"), "a = b");
    });
  });

  describe("isIgnoredNamespace", () => {
    test("ignores Delphi/VCL/Collections platform namespaces", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("system.xml"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("vcl.forms"), true);
      assert.equal(DependencyScanner.isIgnoredNamespace("collections"), true);
    });

    test("does NOT ignore Net (kept for user-facing diagnostics)", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("net"), false);
    });

    test("does NOT ignore arbitrary user namespaces", () => {
      assert.equal(DependencyScanner.isIgnoredNamespace("my_own_ns"), false);
    });
  });

  describe("detectReferencedModules", () => {
    test("detects imports and qualified namespace member access", async () => {
      await withTempDir(async (tmp) => {
        const fileContent = `
      Imports ModA
      Imports ModB.SubClass
      ' Imports ModC
      Namespace App
        Public Sub Run()
          mod_external.SomeCall()
        End Sub
      End Namespace
    `;
        fs.writeFileSync(path.join(tmp, "test.bas"), fileContent, "utf-8");

        const availableSharedModules = new Map<
          string,
          { moduleName: string; sourceFilePath: string; isProj: boolean }
        >();
        availableSharedModules.set("moda", {
          moduleName: "ModA",
          sourceFilePath: "some/path",
          isProj: false,
        });
        availableSharedModules.set("modb", {
          moduleName: "ModB",
          sourceFilePath: "some/path",
          isProj: false,
        });
        availableSharedModules.set("mod_external", {
          moduleName: "mod_external",
          sourceFilePath: "some/path",
          isProj: false,
        });

        const refs = DependencyScanner.detectReferencedModules(tmp, availableSharedModules);
        assert.ok(refs.has("moda"));
        assert.ok(refs.has("modb"));
        assert.ok(refs.has("mod_external"));
      });
    });
  });

  describe("syncDependencies", () => {
    test("syncs declared repository dependencies together with always-on core modules", async () => {
      await withTempDir(async (tmp) => {
        const srcDir = path.join(tmp, "src");
        const repoDir = path.join(tmp, "repo");
        const coreDir = path.join(tmp, "core");
        const data7ModulesDir = path.join(tmp, "data7_modules");
        fs.mkdirSync(srcDir);
        fs.mkdirSync(repoDir);
        fs.mkdirSync(coreDir);
        fs.mkdirSync(data7ModulesDir);

        fs.writeFileSync(
          path.join(repoDir, "mod_feature.bas"),
          "'@Module\nNamespace mod_feature\nEnd Namespace\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(coreDir, "mod_core.bas"),
          "'@Module\nNamespace mod_core\nEnd Namespace\n",
          "utf-8",
        );
        fs.writeFileSync(
          path.join(data7ModulesDir, "stale.bas"),
          "Namespace stale\nEnd Namespace\n",
          "utf-8",
        );

        const synced = DependencyScanner.syncDependencies(
          srcDir,
          data7ModulesDir,
          repoDir,
          { mod_feature: "1.0.0.0" },
          { alwaysSyncDirs: [coreDir] },
        );

        assert.deepEqual(new Set(synced), new Set(["mod_feature", "mod_core"]));
        assert.ok(fs.existsSync(path.join(data7ModulesDir, "mod_feature.bas")));
        assert.ok(fs.existsSync(path.join(data7ModulesDir, "mod_core.bas")));
        assert.equal(fs.existsSync(path.join(data7ModulesDir, "stale.bas")), false);
      });
    });

    test("syncs always-on core modules even when no repository directory exists", async () => {
      await withTempDir(async (tmp) => {
        const srcDir = path.join(tmp, "src");
        const coreDir = path.join(tmp, "core");
        const data7ModulesDir = path.join(tmp, "data7_modules");
        fs.mkdirSync(srcDir);
        fs.mkdirSync(coreDir);

        fs.writeFileSync(
          path.join(coreDir, "mod_core.bas"),
          "'@Module\nNamespace mod_core\nEnd Namespace\n",
          "utf-8",
        );

        const synced = DependencyScanner.syncDependencies(
          srcDir,
          data7ModulesDir,
          path.join(tmp, "missing-repo"),
          {},
          { alwaysSyncDirs: [coreDir] },
        );

        assert.deepEqual(synced, ["mod_core"]);
        assert.ok(fs.existsSync(path.join(data7ModulesDir, "mod_core.bas")));
      });
    });
  });
});
