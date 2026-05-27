import "../_setup/global-hooks";
import { beforeEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import {
  __resetGlobCacheForTests,
  findLegacyDataModulesExcludePattern,
  isExcluded,
  isReadOnlyModuleFile,
  resolveDiagnosticSeverity,
} from "../../infra/configuration";

beforeEach(() => {
  __resetGlobCacheForTests();
});

describe("resolveDiagnosticSeverity", () => {
  const defaultSeverity = vscode.DiagnosticSeverity.Error;

  test("returns the default severity when no override is set for the code", () => {
    assert.equal(resolveDiagnosticSeverity("missing-import", defaultSeverity, {}), defaultSeverity);
  });

  test("maps each named override to the matching vscode.DiagnosticSeverity", () => {
    assert.equal(
      resolveDiagnosticSeverity("x", defaultSeverity, { x: "error" }),
      vscode.DiagnosticSeverity.Error,
    );
    assert.equal(
      resolveDiagnosticSeverity("x", defaultSeverity, { x: "warning" }),
      vscode.DiagnosticSeverity.Warning,
    );
    assert.equal(
      resolveDiagnosticSeverity("x", defaultSeverity, { x: "info" }),
      vscode.DiagnosticSeverity.Information,
    );
    assert.equal(
      resolveDiagnosticSeverity("x", defaultSeverity, { x: "hint" }),
      vscode.DiagnosticSeverity.Hint,
    );
  });

  test('returns undefined when override is "off" (caller should skip the diagnostic)', () => {
    assert.equal(resolveDiagnosticSeverity("x", defaultSeverity, { x: "off" }), undefined);
  });

  test("is case-sensitive on the code key (no implicit normalisation)", () => {
    // The map literally checks `overrides[code]`. Callers pass codes as authored
    // in `DiagnosticCodes`; case differences should miss the override.
    assert.equal(
      resolveDiagnosticSeverity("Missing-Import", defaultSeverity, { "missing-import": "off" }),
      defaultSeverity,
    );
  });
});

describe("isExcluded", () => {
  test("returns false when the pattern list is empty", () => {
    assert.equal(isExcluded("/any/path/file.bas", []), false);
  });

  test("matches a literal glob suffix against the path", () => {
    assert.ok(isExcluded("/project/node_modules/foo.bas", ["**/node_modules/**"]));
    assert.ok(isExcluded("/project/data7_modules/mod_a/file.bas", ["**/data7_modules/**"]));
  });

  test("respects single-segment globs (does not match across slashes)", () => {
    assert.ok(isExcluded("/project/out/foo.bas", ["**/out/*"]));
    // single-* must not cross a slash
    assert.equal(isExcluded("/project/out/nested/foo.bas", ["**/out/*"]), false);
  });

  test("returns false when no pattern matches", () => {
    assert.equal(isExcluded("/project/src/main.bas", ["**/node_modules/**"]), false);
  });

  test("normalises backslashes (Windows paths) before matching", () => {
    assert.ok(isExcluded("C:\\project\\node_modules\\foo.bas", ["**/node_modules/**"]));
  });
});

describe("isReadOnlyModuleFile", () => {
  test("matches paths inside data7_modules/", () => {
    assert.ok(isReadOnlyModuleFile("/project/data7_modules/mod_a.bas"));
    assert.ok(isReadOnlyModuleFile("/project/data7_modules/nested/mod_a.bas"));
    assert.ok(isReadOnlyModuleFile("C:\\project\\data7_modules\\mod_a.bas"));
  });

  test("does not match paths outside data7_modules/", () => {
    assert.equal(isReadOnlyModuleFile("/project/src/main.bas"), false);
    // The folder must be a directory segment, not a substring of another name.
    assert.equal(isReadOnlyModuleFile("/project/my_data7_modules_backup/foo.bas"), false);
  });
});

describe("findLegacyDataModulesExcludePattern", () => {
  test("returns the offending glob when present", () => {
    assert.equal(
      findLegacyDataModulesExcludePattern(["**/node_modules/**", "**/data7_modules/**"]),
      "**/data7_modules/**",
    );
  });

  test("returns undefined when no pattern matches data7_modules/", () => {
    assert.equal(
      findLegacyDataModulesExcludePattern(["**/node_modules/**", "**/.git/**"]),
      undefined,
    );
  });

  test("returns the FIRST offending pattern when several globs match", () => {
    // Both globs match a data7_modules path; the helper must report the one
    // the user authored first so the migration message is deterministic.
    const found = findLegacyDataModulesExcludePattern([
      "**/data7_modules/**",
      "**/data7_modules/*/**",
    ]);
    assert.equal(found, "**/data7_modules/**");
  });
});
