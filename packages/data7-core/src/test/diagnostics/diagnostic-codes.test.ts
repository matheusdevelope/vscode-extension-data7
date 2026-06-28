import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import {
  DiagnosticCodes,
  type MissingImportPayload,
  setDiagnosticPayload,
} from "../../diagnostics/diagnostic-codes";

describe("DiagnosticCodes", () => {
  test("contains every canonical kebab-case code currently used by the linter", () => {
    for (const expected of [
      "missing-import",
      "unused-import",
      "duplicate-import",
      "module-not-found",
      "module-not-declared",
      "unknown-member",
      "private-member-access",
      "event-signature-mismatch",
      "unsupported-member",
      "line-continuation-without-break",
    ]) {
      assert.ok(
        Object.values(DiagnosticCodes).includes(expected as never),
        `DiagnosticCodes should expose "${expected}"`,
      );
    }
  });

  test("uses kebab-case for every value (no spaces, no uppercase)", () => {
    for (const code of Object.values(DiagnosticCodes)) {
      assert.match(code, /^[a-z][a-z0-9-]*$/, `non-canonical code: "${code}"`);
    }
  });
});

describe("setDiagnosticPayload", () => {
  test("attaches the payload to diagnostic.data", () => {
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 5),
      "test",
      vscode.DiagnosticSeverity.Error,
    );
    const payload: MissingImportPayload = {
      code: DiagnosticCodes.MissingImport,
      namespace: "Forms",
      typeName: "TForm",
    };
    setDiagnosticPayload(diag, payload);

    // Cast to access the runtime-typed `data` field.
    const attached = (diag as vscode.Diagnostic & { data?: unknown }).data;
    assert.deepEqual(attached, payload);
  });

  test("overwrites a previous payload when called twice", () => {
    const diag = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 5),
      "test",
      vscode.DiagnosticSeverity.Error,
    );
    setDiagnosticPayload(diag, {
      code: DiagnosticCodes.MissingImport,
      namespace: "A",
      typeName: "X",
    });
    setDiagnosticPayload(diag, {
      code: DiagnosticCodes.MissingImport,
      namespace: "B",
      typeName: "Y",
    });

    const attached = (diag as vscode.Diagnostic & { data?: { namespace: string } }).data;
    assert.equal(attached?.namespace, "B");
  });
});
