import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as vscodeApi from "../../platform/vscode-api";
import {
  serializeLintDiagnostics,
  deserializeLintDiagnostics,
} from "../../analysis/lint-diagnostic-transfer";
import { DiagnosticCodes, setDiagnosticPayload } from "../../diagnostics/diagnostic-codes";
import type { DiagnosticPayload } from "../../diagnostics/diagnostic-codes";

/**
 * Regression: the worker transfer used to drop `data`, `tags` and
 * `relatedInformation`, which silently disabled every quick fix (and the
 * greyed-out rendering) for files linted by the worker pool.
 */
describe("lint diagnostic transfer", () => {
  const makeDiagnostic = (): vscodeApi.Diagnostic => {
    const diag = new vscodeApi.Diagnostic(
      new vscodeApi.Range(3, 6, 3, 20),
      "Namespace 'mod_x' não foi importado.",
      vscodeApi.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.MissingImport;
    diag.source = "data7";
    return diag;
  };

  const roundTrip = (diag: vscodeApi.Diagnostic): vscodeApi.Diagnostic => {
    // JSON mirrors the structured-clone boundary between worker and host.
    const wire = JSON.parse(JSON.stringify(serializeLintDiagnostics([diag]))) as ReturnType<
      typeof serializeLintDiagnostics
    >;
    const [restored] = deserializeLintDiagnostics(wire, vscodeApi);
    assert.ok(restored);
    return restored;
  };

  test("preserves range, message, severity, code and source", () => {
    const restored = roundTrip(makeDiagnostic());

    assert.equal(restored.range.start.line, 3);
    assert.equal(restored.range.start.character, 6);
    assert.equal(restored.range.end.line, 3);
    assert.equal(restored.range.end.character, 20);
    assert.equal(restored.message, "Namespace 'mod_x' não foi importado.");
    assert.equal(restored.severity, vscodeApi.DiagnosticSeverity.Error);
    assert.equal(restored.code, DiagnosticCodes.MissingImport);
    assert.equal(restored.source, "data7");
  });

  test("preserves the typed quick-fix payload", () => {
    const diag = makeDiagnostic();
    const payload: DiagnosticPayload = {
      code: DiagnosticCodes.MissingImport,
      namespace: "mod_x",
      typeName: "TCliente",
    };
    setDiagnosticPayload(diag, payload);

    const restored = roundTrip(diag);
    assert.deepEqual((restored as { data?: unknown }).data, payload);
  });

  test("preserves tags so unused code stays greyed out", () => {
    const diag = makeDiagnostic();
    diag.tags = [vscodeApi.DiagnosticTag.Unnecessary];

    const restored = roundTrip(diag);
    assert.deepEqual(restored.tags, [vscodeApi.DiagnosticTag.Unnecessary]);
  });

  test("preserves related information locations", () => {
    const diag = makeDiagnostic();
    diag.relatedInformation = [
      {
        location: new vscodeApi.Location(
          vscodeApi.Uri.parse("file:///proj/Other.bas"),
          new vscodeApi.Range(1, 0, 1, 5),
        ),
        message: "Declarado aqui.",
      },
    ];

    const restored = roundTrip(diag);
    const [info] = restored.relatedInformation ?? [];
    assert.ok(info);
    assert.equal(info.location.uri.toString(), "file:///proj/Other.bas");
    assert.equal(info.location.range.start.line, 1);
    assert.equal(info.message, "Declarado aqui.");
  });

  test("omits optional fields that were never set", () => {
    const bare = new vscodeApi.Diagnostic(
      new vscodeApi.Range(0, 0, 0, 1),
      "sem payload",
      vscodeApi.DiagnosticSeverity.Warning,
    );

    const [wire] = serializeLintDiagnostics([bare]);
    assert.ok(wire);
    assert.equal("data" in wire, false);
    assert.equal("tags" in wire, false);
    assert.equal("relatedInformation" in wire, false);
  });
});
