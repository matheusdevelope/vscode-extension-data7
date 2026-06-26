import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { DiagnosticService } from "../../services/diagnostic-service";
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
});
