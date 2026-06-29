import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { SugarRegistry } from "../../project/sugars/registry";
import { enumSugarPlugin } from "../../project/sugars/plugins/enum";

test("enum sugar depends on mod_tenum without materializing a virtual wrapper", () => {
  assert.deepEqual(enumSugarPlugin.requiredImports?.(), ["mod_tenum"]);
  assert.deepEqual(enumSugarPlugin.utilityModules?.() ?? [], []);
  assert.deepEqual(SugarRegistry.getRequiredImports(["enum"]), ["mod_tenum"]);
  assert.deepEqual(SugarRegistry.getUtilityModules(["enum"]), []);
});

test("core enum and logger use TTObject without the legacy console module", () => {
  const coreModulesDirCandidates = [
    path.resolve(__dirname, "../../..", "core_modules"),
    path.resolve(__dirname, "../../../../..", "core_modules"),
  ];
  const coreModulesDir =
    coreModulesDirCandidates.find(fs.existsSync) ?? coreModulesDirCandidates[0]!;
  const enumSource = fs.readFileSync(path.join(coreModulesDir, "mod_tenum.bas"), "utf8");
  const loggerSource = fs.readFileSync(path.join(coreModulesDir, "mod_logger.bas"), "utf8");

  assert.match(enumSource, /Class TEnum\s+Inherits TTObject/);
  assert.match(enumSource, /Sub Assign\(pValue As TEnum\)/);
  assert.match(enumSource, /Overrides Function Clone\(\) As TEnum/);
  assert.match(enumSource, /Overrides Sub Dispose\(\)/);
  assert.match(loggerSource, /Class LogLevel\s+Inherits TTObject/);
  assert.match(loggerSource, /TTObject\(pObject\)\.ToString\(\)/);
  assert.match(loggerSource, /ObjectAsString = pObject\.ToString\(\)/);
  assert.ok(!fs.existsSync(path.join(coreModulesDir, "mod_console.bas")));
});
