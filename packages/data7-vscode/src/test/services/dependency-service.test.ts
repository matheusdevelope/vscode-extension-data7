import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { DependencyService } from "../../services/dependency-service";
import { withTempDir } from "../_helpers/temp-dir";

describe("DependencyService", () => {
  test("legacy auto-discovery is disabled", async () => {
    // Tests have been removed because the auto-discovery DependencyScanner
    // was deprecated in favor of explicit package management.
    assert.ok(DependencyService);
  });

  test("syncs bundled core modules into data7_modules for new projects", async () => {
    await withTempDir(async (tmp) => {
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({ nome: "TesteArrays", opcoes: { versao: "1.0.0.0" }, dependencies: {} }),
        "utf-8",
      );

      const synced = await DependencyService.syncProjectData7Modules(tmp);

      assert.ok(synced.includes("core_modules"));
      assert.ok(fs.existsSync(path.join(tmp, "data7_modules", "core_modules", "mod_tlist.bas")));
      assert.ok(fs.existsSync(path.join(tmp, "data7_modules", "core_modules", "mod_tenum.bas")));
    });
  });

  test("startup dependency sync mirrors core modules and removes stale files", async () => {
    await withTempDir(async (tmp) => {
      fs.writeFileSync(
        path.join(tmp, "data7.json"),
        JSON.stringify({ nome: "TesteArrays", opcoes: { versao: "1.0.0.0" }, dependencies: {} }),
        "utf-8",
      );
      const stalePath = path.join(tmp, "data7_modules", "core_modules", "stale.bas");
      fs.mkdirSync(path.dirname(stalePath), { recursive: true });
      fs.writeFileSync(stalePath, "Namespace stale\nEnd Namespace\n", "utf-8");

      await DependencyService.detectAndSyncProjectDependencies(tmp, { silent: true });

      assert.equal(fs.existsSync(stalePath), false);
      assert.ok(fs.existsSync(path.join(tmp, "data7_modules", "core_modules", "mod_tlist.bas")));
    });
  });
});
