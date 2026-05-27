import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { ProjectService } from "../../services/project-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("ProjectService", () => {
  describe("findProjectPaths", () => {
    test("walks up from a file path until it finds data7.json", async () => {
      await withTempDir(async (tmp) => {
        const proj = path.join(tmp, "MyProj.7Proj");
        fs.writeFileSync(proj, "<xml/>", "utf-8");
        fs.writeFileSync(path.join(tmp, "data7.json"), "{}", "utf-8");

        fs.mkdirSync(path.join(tmp, "src", "nested"), { recursive: true });
        const deepFile = path.join(tmp, "src", "nested", "mod_x.bas");
        fs.writeFileSync(deepFile, "Namespace mod_x\nEnd Namespace\n", "utf-8");

        const paths = ProjectService.findProjectPaths(deepFile);
        assert.ok(paths);
        assert.equal(paths.workspaceDir.toLowerCase(), tmp.toLowerCase());
        assert.equal(paths.projectFilePath.toLowerCase(), proj.toLowerCase());
      });
    });

    test("returns undefined when no data7.json is found up the tree", async () => {
      await withTempDir(async (tmp) => {
        const lonely = path.join(tmp, "lonely.bas");
        fs.writeFileSync(lonely, "", "utf-8");

        const paths = ProjectService.findProjectPaths(lonely);
        assert.equal(paths, undefined);
      });
    });

    test("prefers a .7Proj on disk over the data7.json#nome", async () => {
      await withTempDir(async (tmp) => {
        fs.writeFileSync(path.join(tmp, "OnDisk.7Proj"), "<xml/>", "utf-8");
        fs.writeFileSync(
          path.join(tmp, "data7.json"),
          JSON.stringify({ nome: "Different" }),
          "utf-8",
        );
        fs.writeFileSync(path.join(tmp, "src.bas"), "", "utf-8");

        const paths = ProjectService.findProjectPaths(path.join(tmp, "src.bas"));
        assert.ok(paths);
        assert.match(paths.projectFilePath, /OnDisk\.7Proj$/i);
      });
    });
  });
});
