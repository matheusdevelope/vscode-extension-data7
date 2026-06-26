import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { DiagnosticService } from "../../services/diagnostic-service";
import { DiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { createMockDoc, mockTextDocuments, resetMockWorkspace } from "../_helpers/mock-doc";

describe("DiagnosticService live lifecycle", () => {
  const originalCreateDiagnosticCollection = vscode.languages.createDiagnosticCollection;

  afterEach(() => {
    (vscode.languages as any).createDiagnosticCollection = originalCreateDiagnosticCollection;
    DiagnosticService.__resetForTests();
    resetMockWorkspace();
  });

  test("prunes diagnostics for physical .bas files that are no longer open", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );
    const basPath = path.join(srcDir, "mod_test.bas");
    fs.writeFileSync(basPath, "Namespace mod_test\nEnd Namespace\n", "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    const deleted: string[] = [];
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        deleted.push(uri.toString().toLowerCase());
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(
      vscode.Uri.file(basPath).toString(),
      fs.readFileSync(basPath, "utf8"),
    );

    DiagnosticService.refreshDiagnostics(doc);
    assert.ok(entries.has(doc.uri.toString().toLowerCase()));

    mockTextDocuments.length = 0;
    DiagnosticService.pruneClosedDiagnostics();

    assert.equal(entries.has(doc.uri.toString().toLowerCase()), false);
    assert.deepEqual(deleted, [doc.uri.toString().toLowerCase()]);
  });

  test("does not emit module-not-found for imported local classes used statically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Imports helpers",
      "Imports stringHelpers",
      "Namespace app",
      "Public Sub Run()",
      "  Helper.timeUid()",
      '  stringHelper.split("-", "1-2")',
      "End Sub",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");
    fs.writeFileSync(
      path.join(srcDir, "helpers.bas"),
      "Namespace helpers\nClass Helper\nEnd Class\nEnd Namespace\n",
      "utf8",
    );
    fs.writeFileSync(
      path.join(srcDir, "stringHelpers.bas"),
      "Namespace stringHelpers\nClass StringHelper\nEnd Class\nEnd Namespace\n",
      "utf8",
    );

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not emit module-not-found for With shorthand member access", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Namespace app",
      "Class Screen",
      "  Public Sub Run()",
      "    With Me",
      '      .Title = "Link de Cobranca"',
      "      .Refresh()",
      "    End With",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });

  test("does not emit module-not-found for imported system classes used statically", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data7-diagnostics-"));
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "data7.json"),
      JSON.stringify({ nome: "TmpProject", dependencies: {} }),
      "utf8",
    );

    const principalPath = path.join(srcDir, "Principal.bas");
    const principal = [
      "Imports IO",
      "Imports System.IOUtils",
      "Namespace app",
      "Class Screen",
      "  Public Sub Run(pPath As String)",
      "    TFile.Exists(pPath)",
      "    File.ExtractName(pPath)",
      "  End Sub",
      "End Class",
      "End Namespace",
      "",
    ].join("\n");
    fs.writeFileSync(principalPath, principal, "utf8");

    const entries = new Map<string, vscode.Diagnostic[]>();
    (vscode.languages as any).createDiagnosticCollection = () => ({
      set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
        entries.set(uri.toString().toLowerCase(), diags);
      },
      get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
      delete: (uri: vscode.Uri) => {
        entries.delete(uri.toString().toLowerCase());
      },
      clear: () => {
        entries.clear();
      },
      dispose: () => undefined,
    });

    DiagnosticService.initialize({ subscriptions: [] } as any);
    const doc = createMockDoc(vscode.Uri.file(principalPath).toString(), principal);

    DiagnosticService.refreshDiagnostics(doc);

    const diags = entries.get(doc.uri.toString().toLowerCase()) ?? [];
    assert.equal(
      diags.some((diag) => diag.code === DiagnosticCodes.ModuleNotFound),
      false,
    );
  });
});
