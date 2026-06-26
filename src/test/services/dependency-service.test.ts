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
});
