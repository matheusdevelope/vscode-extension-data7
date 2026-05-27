import "../_setup/global-hooks";
import { beforeEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import {
  __resetGlobCacheForTests,
  isExcluded,
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
