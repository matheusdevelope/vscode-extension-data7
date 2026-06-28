import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { DependencyService } from "../../services/dependency-service";
import { RepositoryService } from "../../services/repository-service";
import { withTempDir } from "../_helpers/temp-dir";
import { resetMockWorkspace } from "../_helpers/mock-doc";

describe("DependencyService", () => {
  const originalGetRepoBasPath = RepositoryService.getRepoBasPath;

  afterEach(() => {
    RepositoryService.getRepoBasPath = originalGetRepoBasPath;
    resetMockWorkspace();
  });

  test("promotes a transitive shared module when the local module stops providing it", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      const data7ModulesDir = path.join(workspaceDir, "data7_modules");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        "Imports mod_database\nNamespace app\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "mod_base_list.bas"),
        "Namespace mod_base_list\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_database.bas"),
        "'@Module\nImports mod_base_list\nNamespace mod_database\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_base_list.bas"),
        "'@Module\nNamespace mod_base_list\nEnd Namespace\n",
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      await DependencyService.refreshWorkspaceDependencies(workspaceDir);
      let data7Json = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(Object.keys(data7Json.dependencies).sort(), ["mod_database"]);
      assert.equal(fs.existsSync(path.join(data7ModulesDir, "mod_database.bas")), true);
      assert.equal(fs.existsSync(path.join(data7ModulesDir, "mod_base_list.bas")), false);

      fs.unlinkSync(path.join(srcDir, "mod_base_list.bas"));

      await DependencyService.refreshWorkspaceDependencies(workspaceDir);
      data7Json = JSON.parse(fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      assert.deepEqual(Object.keys(data7Json.dependencies).sort(), [
        "mod_base_list",
        "mod_database",
      ]);
      assert.equal(fs.existsSync(path.join(data7ModulesDir, "mod_base_list.bas")), true);
    });
  });

  test("does not detect dependencies from string literals or declared member access", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        [
          "Namespace app",
          "Class Usuario",
          "  DataBase As String",
          "  Public Sub Run()",
          '    Dim cmd As String = "powershell.exe -ExecutionPolicy Bypass"',
          "    Dim label As String = DataBase.toString()",
          "  End Sub",
          "End Class",
          "End Namespace",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_powershell.bas"),
        "'@Module\nNamespace mod_powershell\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_database.bas"),
        "'@Module\nImports mod_rdbms\nNamespace mod_database\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_rdbms.bas"),
        "'@Module\nNamespace mod_rdbms\nEnd Namespace\n",
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      await DependencyService.refreshWorkspaceDependencies(workspaceDir);

      const data7Json = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(data7Json.dependencies, {});
    });
  });

  test("does not report local imported classes as missing modules", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        [
          "Imports helpers",
          "Imports stringHelpers",
          "Namespace app",
          "Public Sub Run()",
          "  Helper.timeUid()",
          '  stringHelper.split("-", "1-2")',
          "End Sub",
          "End Namespace",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "helpers.bas"),
        "Namespace helpers\nClass Helper\nEnd Class\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "stringHelpers.bas"),
        "Namespace stringHelpers\nClass StringHelper\nEnd Class\nEnd Namespace\n",
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      const result = await DependencyService.refreshWorkspaceDependencies(workspaceDir);

      const data7Json = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(data7Json.dependencies, {});
      assert.deepEqual(result.missing, []);
    });
  });

  test("resolves repository modules by exact namespace instead of mod_ prefix convention", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        [
          "Imports billing.Sub",
          "Imports database",
          "Namespace app",
          "Public Sub Run()",
          "End Sub",
          "End Namespace",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "billing.bas"),
        "'@Module\nNamespace billing\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(repoDir, "mod_database.bas"),
        "'@Module\nNamespace mod_database\nEnd Namespace\n",
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      const result = await DependencyService.refreshWorkspaceDependencies(workspaceDir);

      const data7Json = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(Object.keys(data7Json.dependencies), ["billing"]);
      assert.deepEqual(result.missing, ["database"]);
    });
  });

  test("preserves a referenced local data7_modules copy when the repository is missing it", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      const data7ModulesDir = path.join(workspaceDir, "data7_modules");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });
      fs.mkdirSync(data7ModulesDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: { mod_foreign: "1.0.0.0" } }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        "Imports mod_foreign\nNamespace app\nEnd Namespace\n",
        "utf8",
      );
      fs.writeFileSync(
        path.join(data7ModulesDir, "mod_foreign.bas"),
        "'@Module\nNamespace mod_foreign\nEnd Namespace\n",
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      const result = await DependencyService.refreshWorkspaceDependencies(workspaceDir);

      const data7Json = JSON.parse(
        fs.readFileSync(path.join(workspaceDir, "data7.json"), "utf8"),
      ) as { dependencies: Record<string, string> };
      assert.deepEqual(data7Json.dependencies, { mod_foreign: "1.0.0.0" });
      assert.deepEqual(result.missing, []);
      assert.equal(fs.existsSync(path.join(data7ModulesDir, "mod_foreign.bas")), true);
    });
  });

  test("does not report project global variables as missing modules", async () => {
    await withTempDir(async (tmp) => {
      const workspaceDir = path.join(tmp, "workspace");
      const srcDir = path.join(workspaceDir, "src");
      const repoDir = path.join(tmp, "repo");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.mkdirSync(repoDir, { recursive: true });

      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }, null, 2),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Principal.bas"),
        [
          "Namespace app",
          "Dim _usuario As TObject",
          'Const shCodigoTitulo As String = "A"',
          "End Namespace",
          "",
        ].join("\n"),
        "utf8",
      );
      fs.writeFileSync(
        path.join(srcDir, "Screen.bas"),
        [
          "Namespace app",
          "Class Screen",
          "  Public Sub Run()",
          "    _usuario.Free()",
          "    shCodigoTitulo.ToString()",
          "  End Sub",
          "End Class",
          "End Namespace",
          "",
        ].join("\n"),
        "utf8",
      );

      RepositoryService.getRepoBasPath = () => repoDir;

      const result = await DependencyService.refreshWorkspaceDependencies(workspaceDir);

      assert.deepEqual(result.missing, []);
    });
  });
});
