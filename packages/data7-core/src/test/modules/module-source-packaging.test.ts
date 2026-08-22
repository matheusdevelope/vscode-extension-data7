import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { mock } from "node:test";
import { DependencySynchronizer } from "../../modules/dependency-synchronizer";
import { RepositoryQueryService } from "../../modules/repository-query-service";
import {
  basDeclaresNamespace,
  commentOutBasSource,
  normalizeImportedModuleSources,
} from "../../modules/module-source-packaging";

describe("module-source-packaging", () => {
  test("basDeclaresNamespace detects NamespaceDeclaration", () => {
    assert.equal(basDeclaresNamespace("Namespace Foo\nEnd Namespace\n"), true);
    assert.equal(basDeclaresNamespace("Dim x As Integer\n"), false);
  });

  test("commentOutBasSource prefixes every executable line", () => {
    const input = "Namespace Foo\n   Class T\n   End Class\nEnd Namespace\n";
    const commented = commentOutBasSource(input);
    assert.equal(commented, "' Namespace Foo\n'    Class T\n'    End Class\n' End Namespace\n");
    assert.equal(basDeclaresNamespace(commented), false);
  });
});

describe("normalizeImportedModuleSources", () => {
  let tempDir: string;

  beforeEach(() => {
    const baseDir = path.resolve(__dirname, "..", "..", "..", "..", "..", "scratch");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    tempDir = fs.mkdtempSync(path.join(baseDir, "mod-pack-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("discards .bas without Namespace and comments Principal with Namespace", () => {
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, "demo.bas"), 'Print("hi")\n', "utf-8");
    fs.writeFileSync(
      path.join(srcDir, "Principal.bas"),
      "Namespace ModX\n   Class T\n   End Class\nEnd Namespace\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(srcDir, "ModX.bas"),
      "Namespace ModX\n   Class U\n   End Class\nEnd Namespace\n",
      "utf-8",
    );

    const result = normalizeImportedModuleSources(tempDir);
    assert.equal(result.discarded.length, 1);
    assert.equal(result.commentedPrincipals.length, 1);
    assert.ok(!fs.existsSync(path.join(srcDir, "demo.bas")));
    assert.ok(fs.existsSync(path.join(srcDir, "Principal.bas")));
    assert.ok(fs.existsSync(path.join(srcDir, "ModX.bas")));

    const principal = fs.readFileSync(path.join(srcDir, "Principal.bas"), "utf-8");
    assert.ok(principal.startsWith("' Namespace ModX"));
    assert.ok(!basDeclaresNamespace(principal));
  });
});

describe("DependencySynchronizer import normalization", () => {
  let tempWorkspace: string;
  let tempHomedir: string;
  let restoreMock: () => void;

  beforeEach(() => {
    const baseDir = path.resolve(__dirname, "..", "..", "..", "..", "..", "scratch");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    tempWorkspace = fs.mkdtempSync(path.join(baseDir, "sync-ws-"));
    tempHomedir = fs.mkdtempSync(path.join(baseDir, "sync-home-"));

    const mockPath = path.join(tempHomedir, ".data7", "local_modules");
    fs.mkdirSync(mockPath, { recursive: true });

    const pathMock = mock.method(
      RepositoryQueryService,
      "getLocalPrivateModulesPath",
      () => mockPath,
    );
    const onlineMock = mock.method(
      RepositoryQueryService,
      "fetchOnlineModuleFiles",
      async () => null,
    );
    const extensionPaths =
      require("../../infra/extension-paths") as typeof import("../../infra/extension-paths");
    const coreMock = mock.method(extensionPaths, "getCoreModulesPath", () =>
      path.join(tempHomedir, "missing-core"),
    );

    restoreMock = () => {
      pathMock.mock.restore();
      onlineMock.mock.restore();
      coreMock.mock.restore();
    };
  });

  afterEach(() => {
    restoreMock();
    if (fs.existsSync(tempWorkspace)) {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    }
    if (fs.existsSync(tempHomedir)) {
      fs.rmSync(tempHomedir, { recursive: true, force: true });
    }
  });

  test("sync comments Principal.bas and drops files without Namespace", async () => {
    const moduleDir = path.join(tempHomedir, ".data7", "local_modules", "mod_demo");
    const srcDir = path.join(moduleDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(moduleDir, "data7.json"),
      JSON.stringify({ nome: "mod_demo", opcoes: { versao: "1.0.0.0" } }),
    );
    fs.writeFileSync(
      path.join(srcDir, "Principal.bas"),
      "Namespace ModDemo\n   Class Entry\n   End Class\nEnd Namespace\n",
    );
    fs.writeFileSync(path.join(srcDir, "scratch.bas"), "Print(1)\n");
    fs.writeFileSync(
      path.join(srcDir, "ModDemo.bas"),
      "Namespace ModDemo\n   Class TItem\n   End Class\nEnd Namespace\n",
    );

    await DependencySynchronizer.sync(tempWorkspace, { mod_demo: "1.0.0.0" });

    const importedSrc = path.join(tempWorkspace, "data7_modules", "mod_demo", "src");
    assert.ok(!fs.existsSync(path.join(importedSrc, "scratch.bas")));
    assert.ok(fs.existsSync(path.join(importedSrc, "ModDemo.bas")));
    const principal = fs.readFileSync(path.join(importedSrc, "Principal.bas"), "utf-8");
    assert.ok(principal.trimStart().startsWith("'"));
    assert.ok(principal.includes("' Namespace ModDemo"));
  });
});
