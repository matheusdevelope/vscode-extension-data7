import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { ActivationService } from "../../services/activation-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("ActivationService", () => {
  describe("resolveProjectFilePath", () => {
    test("returns the .7Proj on disk when present (highest priority)", async () => {
      await withTempDir(async (tmp) => {
        const proj = path.join(tmp, "MyProj.7Proj");
        fs.writeFileSync(proj, "<xml></xml>", "utf-8");
        fs.writeFileSync(path.join(tmp, "data7.json"), "{}", "utf-8");

        const resolved = ActivationService.resolveProjectFilePath(
          tmp,
          path.join(tmp, "data7.json"),
        );
        assert.equal(resolved.toLowerCase(), proj.toLowerCase());
      });
    });

    test("prefers the .7Proj on disk over data7.json#nome (disk wins)", async () => {
      await withTempDir(async (tmp) => {
        fs.writeFileSync(path.join(tmp, "OldName.7Proj"), "<xml></xml>", "utf-8");
        fs.writeFileSync(
          path.join(tmp, "data7.json"),
          JSON.stringify({ nome: "NewName" }),
          "utf-8",
        );

        const resolved = ActivationService.resolveProjectFilePath(
          tmp,
          path.join(tmp, "data7.json"),
        );
        assert.match(resolved, /OldName\.7Proj$/i);
      });
    });

    test("falls back to data7.json#nome when no .7Proj exists on disk", async () => {
      await withTempDir(async (tmp) => {
        fs.writeFileSync(
          path.join(tmp, "data7.json"),
          JSON.stringify({ nome: "Awesome" }),
          "utf-8",
        );

        const resolved = ActivationService.resolveProjectFilePath(
          tmp,
          path.join(tmp, "data7.json"),
        );
        assert.equal(path.basename(resolved), "Awesome.7Proj");
      });
    });

    test("falls back to the folder name when data7.json is unreadable/invalid", async () => {
      await withTempDir(async (tmp) => {
        fs.writeFileSync(path.join(tmp, "data7.json"), "{ not json", "utf-8");

        const resolved = ActivationService.resolveProjectFilePath(
          tmp,
          path.join(tmp, "data7.json"),
        );
        assert.equal(path.basename(resolved), `${path.basename(tmp)}.7Proj`);
      });
    });
  });
});
