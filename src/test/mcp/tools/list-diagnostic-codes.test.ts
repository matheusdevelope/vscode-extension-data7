/**
 * Tests for the `data7_list_diagnostic_codes` MCP tool. Confirms the
 * canonical DiagnosticCodes table is reachable and each code has a
 * corresponding example folder when the convention requires it.
 */
import "../../_setup/global-hooks";

import * as fs from "fs";
import * as path from "path";
import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { DiagnosticCodes } from "../../../diagnostics/diagnostic-codes";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const DIAG_EXAMPLES_DIR = path.join(REPO_ROOT, "docs", "exemple", "diagnostics");

describe("data7_list_diagnostic_codes — DiagnosticCodes catalog", () => {
  test("catalog declares at least 19 stable codes", () => {
    const keys = Object.values(DiagnosticCodes);
    assert.ok(keys.length >= 19, `expected ≥19 codes, got ${String(keys.length)}`);
  });

  test("every code is kebab-case and starts with a letter", () => {
    for (const code of Object.values(DiagnosticCodes)) {
      assert.match(code, /^[a-z][a-z0-9-]*$/, `code "${code}" is not kebab-case`);
    }
  });

  test("missing-import has both trigger and after-quickfix examples", () => {
    assert.ok(fs.existsSync(path.join(DIAG_EXAMPLES_DIR, "missing-import", "trigger.bas")));
    assert.ok(fs.existsSync(path.join(DIAG_EXAMPLES_DIR, "missing-import", "after-quickfix.bas")));
  });
});
