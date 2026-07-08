import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  DEFAULT_EXTENSION_SETTINGS,
  migrateLegacyVscodeConfiguration,
  normalizeExtensionSettings,
  parseExtensionSettingsFile,
} from "../../infra/extension-settings";

describe("extension-settings", () => {
  test("normalizeExtensionSettings fills defaults for partial input", () => {
    const settings = normalizeExtensionSettings({
      executorPath: "C:\\Executor.exe",
    });
    assert.equal(settings.executorPath, "C:\\Executor.exe");
    assert.equal(settings.features.language.generics, true);
    assert.equal(settings.sugars.enabled, true);
    assert.deepEqual(settings.exclude, [...DEFAULT_EXTENSION_SETTINGS.exclude]);
  });

  test("migrateLegacyVscodeConfiguration maps deprecated autoFormatOnSave", () => {
    const settings = migrateLegacyVscodeConfiguration({
      autoFormatOnSave: true,
    });
    assert.equal(settings.features.save.autoFormatOnSave, true);
  });

  test("parseExtensionSettingsFile reads schema wrapper", () => {
    const parsed = parseExtensionSettingsFile({
      schemaVersion: 1,
      settings: {
        executorPath: "D:\\bin\\Executor.exe",
      },
    });
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.settings.executorPath, "D:\\bin\\Executor.exe");
  });
});
