import "../_setup/global-hooks";
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import {
  DiagnosticCodes,
  DEFAULT_REACHABILITY_REMOVE_OPTIONS,
  collectUnusedCodeDiagnostics,
} from "../../index";
import { loadExample, parseExampleHeader } from "../_helpers/fixtures";
import * as vscode from "../../platform/vscode-api";

describe("unused-code analyzer", () => {
  test("emits unused-code for orphan class in trigger example", () => {
    const code = loadExample("diagnostics/unused-code/trigger.bas");
    const header = parseExampleHeader(code);
    assert.equal(header.diagnostics.length, 1);
    assert.equal(header.diagnostics[0]?.code, DiagnosticCodes.UnusedCode);

    const hits = collectUnusedCodeDiagnostics(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code,
        },
      ],
      {
        alwaysInclude: [],
        remove: DEFAULT_REACHABILITY_REMOVE_OPTIONS,
      },
    );

    const orphanHits = hits.filter((hit) =>
      hit.diagnostic.message.toLowerCase().includes("deadclass"),
    );
    assert.ok(orphanHits.length >= 1, "expected DeadClass unused-code hit");
    const hit = orphanHits[0];
    assert.ok(hit);
    assert.equal(hit.diagnostic.code, DiagnosticCodes.UnusedCode);
    assert.equal(hit.diagnostic.severity, vscode.DiagnosticSeverity.Hint);
    assert.deepEqual(hit.diagnostic.tags, [vscode.DiagnosticTag.Unnecessary]);
    const expectedLine = header.diagnostics[0]?.line;
    assert.ok(expectedLine !== undefined);
    assert.equal(hit.diagnostic.range.start.line + 1, expectedLine);
    const sourceLines = code.split(/\r?\n/);
    const endLine = hit.diagnostic.range.end.line;
    const endLineText = sourceLines[endLine] ?? "";
    assert.match(endLineText, /End\s+Class/i);
    assert.equal(hit.diagnostic.range.end.character, endLineText.length);
  });

  test("does not emit unused-code for reachable helper class", () => {
    const code = loadExample("diagnostics/unused-code/ok-reachable.bas");
    const header = parseExampleHeader(code);
    assert.equal(header.diagnostics.length, 0);

    const hits = collectUnusedCodeDiagnostics(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code,
        },
      ],
      {
        alwaysInclude: [],
        remove: DEFAULT_REACHABILITY_REMOVE_OPTIONS,
      },
    );

    const helperHits = hits.filter((hit) => /thelper|touch/i.test(hit.diagnostic.message));
    assert.deepEqual(
      helperHits.map((h) => h.diagnostic.message),
      [],
      `unexpected unused-code hits: ${helperHits.map((h) => h.diagnostic.message).join("; ")}`,
    );
  });

  test("does not flag Sub New or Sub Free on a live class", () => {
    const hits = collectUnusedCodeDiagnostics(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code: `Namespace mod_principal
   Class Program
      Public Sub Main()
         Dim x As TWidget = New TWidget()
         x.Used()
      End Sub
   End Class

   Class TWidget
      Public Sub New()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

      Public Sub Used()
      End Sub

      Public Sub Dead()
      End Sub
   End Class
End Namespace`,
        },
      ],
      {
        alwaysInclude: [],
        remove: DEFAULT_REACHABILITY_REMOVE_OPTIONS,
      },
    );

    assert.equal(
      hits.filter((h) => /\b(new|free)\b/i.test(h.diagnostic.message)).length,
      0,
      `lifecycle methods should not be flagged: ${hits.map((h) => h.diagnostic.message).join("; ")}`,
    );
    assert.ok(
      hits.some((h) => /dead/i.test(h.diagnostic.message)),
      "expected Dead method to remain flagged",
    );
  });

  test("respects remove.classes=false", () => {
    const code = loadExample("diagnostics/unused-code/trigger.bas");
    const hits = collectUnusedCodeDiagnostics(
      [
        {
          moduleName: "Principal",
          fileUri: "file:///workspace/src/Principal.bas",
          code,
        },
      ],
      {
        alwaysInclude: [],
        remove: { ...DEFAULT_REACHABILITY_REMOVE_OPTIONS, classes: false },
      },
    );
    assert.equal(hits.filter((h) => /deadclass/i.test(h.diagnostic.message)).length, 0);
  });
});
