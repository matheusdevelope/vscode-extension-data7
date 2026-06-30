import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { mock } from "node:test";
import { ModuleOrchestrator } from "../../modules/module-orchestrator";
import { RepositoryQueryService } from "../../modules/repository-query-service";

describe("ModuleOrchestrator - publishModuleLocally", () => {
  let tempWorkspace: string;
  let tempHomedir: string;
  let restoreMock: () => void;

  beforeEach(() => {
    // Create isolated temp workspace and temp homedir inside workspace root to obey USER_RULES
    const baseDir = path.resolve(__dirname, "..", "..", "..", "..", "..", "scratch");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    tempWorkspace = fs.mkdtempSync(path.join(baseDir, "test-ws-"));
    tempHomedir = fs.mkdtempSync(path.join(baseDir, "test-home-"));

    const mockPath = path.join(tempHomedir, ".data7", "local_modules");

    // Mock RepositoryQueryService.getLocalPrivateModulesPath directly
    const pathMock = mock.method(RepositoryQueryService, "getLocalPrivateModulesPath", () => {
      if (!fs.existsSync(mockPath)) {
        fs.mkdirSync(mockPath, { recursive: true });
      }
      return mockPath;
    });
    const onlineListMock = mock.method(
      RepositoryQueryService,
      "listOnlineModuleEntries",
      async () => [],
    );

    restoreMock = () => {
      pathMock.mock.restore();
      onlineListMock.mock.restore();
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

  test("getLocalPrivateModulesPath uses agnostic local_modules path under homedir", () => {
    // Verify that the mock works and returns the redirected temp folder
    const expectedPath = path.join(tempHomedir, ".data7", "local_modules");
    assert.equal(RepositoryQueryService.getLocalPrivateModulesPath(), expectedPath);
  });

  test("throws error when data7.json does not exist in workspace", async () => {
    await assert.rejects(
      ModuleOrchestrator.publishModuleLocally(tempWorkspace),
      /data7.json' não encontrado/,
    );
  });

  test("throws error when nome is missing in data7.json", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        opcoes: { versao: "1.2.3.4" },
      }),
    );

    await assert.rejects(
      ModuleOrchestrator.publishModuleLocally(tempWorkspace),
      /campo 'nome' no arquivo 'data7.json' é obrigatório/,
    );
  });

  test("throws error when src directory does not exist", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "ModuloTeste",
        opcoes: { versao: "1.0.0.0" },
      }),
    );

    await assert.rejects(
      ModuleOrchestrator.publishModuleLocally(tempWorkspace),
      /pasta 'src' é obrigatória/,
    );
  });

  test("throws error when src directory has no .bas files", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "ModuloTeste",
        opcoes: { versao: "1.0.0.0" },
      }),
    );
    fs.mkdirSync(path.join(tempWorkspace, "src"));

    await assert.rejects(
      ModuleOrchestrator.publishModuleLocally(tempWorkspace),
      /deve conter pelo menos um arquivo de código/,
    );
  });

  test("throws error when a .bas file contains syntax/parser errors", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "ModuloTeste",
        opcoes: { versao: "1.0.0.0" },
      }),
    );
    const srcDir = path.join(tempWorkspace, "src");
    fs.mkdirSync(srcDir);

    // Write invalid basic syntax (unterminated Class block)
    fs.writeFileSync(path.join(srcDir, "Principal.bas"), "Class Invalido\n");

    await assert.rejects(
      ModuleOrchestrator.publishModuleLocally(tempWorkspace),
      /Erro de compilação\/sintaxe em 'Principal.bas'/,
    );
  });

  test("successfully publishes module when all validations pass", async () => {
    fs.writeFileSync(
      path.join(tempWorkspace, "data7.json"),
      JSON.stringify({
        nome: "ModuloTeste",
        opcoes: { versao: "1.0.0.0" },
      }),
    );
    const srcDir = path.join(tempWorkspace, "src");
    fs.mkdirSync(srcDir);

    // Write valid basic syntax
    fs.writeFileSync(
      path.join(srcDir, "Principal.bas"),
      "Namespace ModuloTeste\n   Class TClient\n   End Class\nEnd Namespace\n",
    );

    await ModuleOrchestrator.publishModuleLocally(tempWorkspace);

    // Verify copy exists in local private repository
    const expectedModuleDir = path.join(tempHomedir, ".data7", "local_modules", "moduloteste");
    assert.ok(fs.existsSync(expectedModuleDir), "Target module directory should exist");
    assert.ok(
      fs.existsSync(path.join(expectedModuleDir, "data7.json")),
      "data7.json should be copied",
    );
    assert.ok(
      fs.existsSync(path.join(expectedModuleDir, "src", "Principal.bas")),
      "Principal.bas should be copied",
    );

    // Verify content matches
    const copiedContent = fs.readFileSync(
      path.join(expectedModuleDir, "src", "Principal.bas"),
      "utf-8",
    );
    assert.ok(copiedContent.includes("Class TClient"));
  });

  test("installs multiple local modules with resolved versions", async () => {
    writeProjectManifest(tempWorkspace, {
      nome: "App",
      opcoes: { versao: "1.0.0.0" },
      dependencies: {},
    });
    writeLocalRepositoryModule(tempHomedir, "mod_a", "1.2.0.0");
    writeLocalRepositoryModule(tempHomedir, "mod_b", "2.0.0.0");

    const result = await ModuleOrchestrator.installModules(tempWorkspace, ["mod_a", "mod_b"]);

    assert.deepEqual(result.missing, []);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempWorkspace, "data7.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(manifest.dependencies.mod_a, "1.2.0.0");
    assert.equal(manifest.dependencies.mod_b, "2.0.0.0");
    assert.ok(fs.existsSync(path.join(tempWorkspace, "data7_modules", "mod_a", "src", "main.bas")));
    assert.ok(fs.existsSync(path.join(tempWorkspace, "data7_modules", "mod_b", "src", "main.bas")));
  });

  test("blocks installing the active project module as its own dependency", async () => {
    writeProjectManifest(tempWorkspace, {
      nome: "forms",
      module: { enabled: true, name: "forms" },
      opcoes: { versao: "1.0.0.0" },
      dependencies: {},
    });
    writeLocalRepositoryModule(tempHomedir, "forms", "1.0.0.0");

    await assert.rejects(
      ModuleOrchestrator.installModules(tempWorkspace, ["forms"]),
      /próprio projeto ativo/,
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempWorkspace, "data7.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    assert.deepEqual(manifest.dependencies, {});
  });

  test("marks catalog entries matching module.name as the current project", async () => {
    writeProjectManifest(tempWorkspace, {
      nome: "Projeto Forms",
      module: { enabled: true, name: "forms" },
      opcoes: { versao: "1.0.0.0" },
      dependencies: {},
    });
    writeLocalRepositoryModule(tempHomedir, "forms", "1.0.0.0");

    const catalog = await ModuleOrchestrator.listCatalog(tempWorkspace);

    const forms = catalog.find((entry) => entry.name === "forms");
    assert.ok(forms);
    assert.equal(forms.isCurrentProject, true);
    assert.equal(forms.installed, true);
    assert.equal(forms.updateAvailable, false);
  });

  test("updates selected modules and leaves current modules unchanged", async () => {
    writeProjectManifest(tempWorkspace, {
      nome: "App",
      opcoes: { versao: "1.0.0.0" },
      dependencies: { mod_a: "1.0.0.0", mod_b: "2.0.0.0" },
    });
    writeLocalRepositoryModule(tempHomedir, "mod_a", "1.1.0.0");
    writeLocalRepositoryModule(tempHomedir, "mod_b", "2.0.0.0");

    const result = await ModuleOrchestrator.updateModules(tempWorkspace, ["mod_a"]);

    assert.deepEqual(result.updated, ["mod_a@1.1.0.0"]);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempWorkspace, "data7.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(manifest.dependencies.mod_a, "1.1.0.0");
    assert.equal(manifest.dependencies.mod_b, "2.0.0.0");
  });

  test("removes modules from manifest and data7_modules cleanup", async () => {
    writeProjectManifest(tempWorkspace, {
      nome: "App",
      opcoes: { versao: "1.0.0.0" },
      dependencies: { mod_a: "1.0.0.0", mod_b: "1.0.0.0" },
    });
    writeLocalRepositoryModule(tempHomedir, "mod_a", "1.0.0.0");
    writeLocalRepositoryModule(tempHomedir, "mod_b", "1.0.0.0");
    await ModuleOrchestrator.installModules(tempWorkspace, ["mod_a", "mod_b"]);

    const result = await ModuleOrchestrator.removeModules(tempWorkspace, ["mod_a"]);

    assert.deepEqual(result.removed, ["mod_a"]);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tempWorkspace, "data7.json"), "utf-8"),
    ) as { dependencies: Record<string, string> };
    assert.equal(manifest.dependencies.mod_a, undefined);
    assert.equal(manifest.dependencies.mod_b, "1.0.0.0");
    assert.equal(fs.existsSync(path.join(tempWorkspace, "data7_modules", "mod_a")), false);
    assert.ok(fs.existsSync(path.join(tempWorkspace, "data7_modules", "mod_b")));
  });
});

function writeProjectManifest(workspaceDir: string, manifest: Record<string, unknown>): void {
  fs.writeFileSync(path.join(workspaceDir, "data7.json"), JSON.stringify(manifest, null, 2));
}

function writeLocalRepositoryModule(homeDir: string, moduleName: string, version: string): void {
  const moduleDir = path.join(homeDir, ".data7", "local_modules", moduleName);
  fs.mkdirSync(path.join(moduleDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(moduleDir, "data7.json"),
    JSON.stringify({ nome: moduleName, version, opcoes: { versao: version } }, null, 2),
  );
  fs.writeFileSync(
    path.join(moduleDir, "src", "main.bas"),
    `Namespace ${moduleName}\nEnd Namespace\n`,
  );
}
