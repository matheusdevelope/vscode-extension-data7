import "../_setup/global-hooks";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, test } from "node:test";
import * as vscode from "vscode";
import { WorkspaceFixService } from "../../services/workspace-fix-service";
import { withTempDir } from "../_helpers/temp-dir";

interface WorkspaceFixServiceInternals {
  applyFixesToUris: (
    uris: readonly vscode.Uri[],
    options: { readonly save?: boolean; readonly workspaceDir?: string },
  ) => Promise<{
    readonly filesScanned: number;
    readonly filesFixed: number;
    readonly totalEdits: number;
  }>;
}

describe("WorkspaceFixService pre-build cache", () => {
  const internals = WorkspaceFixService as unknown as WorkspaceFixServiceInternals;
  const originalFindFiles = vscode.workspace.findFiles;
  const originalApplyFixesToUris = internals.applyFixesToUris;

  afterEach(() => {
    vscode.workspace.findFiles = originalFindFiles;
    internals.applyFixesToUris = originalApplyFixesToUris;
    WorkspaceFixService.__resetBuildFixCacheForTests();
  });

  test("processes only files changed since the previous successful build pass", async () => {
    await withTempDir(async (workspaceDir) => {
      const sourcePath = path.join(workspaceDir, "src", "Principal.bas");
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(sourcePath, "Sub Main()\r\nEnd Sub\r\n", "utf-8");
      const sourceUri = vscode.Uri.file(sourcePath);
      vscode.workspace.findFiles = async () => [sourceUri];

      const processedCounts: number[] = [];
      internals.applyFixesToUris = async (uris) => {
        processedCounts.push(uris.length);
        return { filesScanned: uris.length, filesFixed: 0, totalEdits: 0 };
      };

      await WorkspaceFixService.fixWorkspaceForBuild(workspaceDir, { mode: "changed" });
      await WorkspaceFixService.fixWorkspaceForBuild(workspaceDir, { mode: "changed" });

      fs.writeFileSync(
        sourcePath,
        "Sub Main()\r\n  Dim changed As Integer\r\nEnd Sub\r\n",
        "utf-8",
      );
      await WorkspaceFixService.fixWorkspaceForBuild(workspaceDir, { mode: "changed" });

      assert.deepEqual(processedCounts, [1, 0, 1]);
    });
  });

  test("republishes empty diagnostics for already-clean files to clear stale Problems", async () => {
    await withTempDir(async (workspaceDir) => {
      const sourcePath = path.join(workspaceDir, "src", "helpers.bas");
      fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
      fs.writeFileSync(
        path.join(workspaceDir, "data7.json"),
        JSON.stringify({ nome: "TmpProject", dependencies: {} }),
        "utf-8",
      );
      // Minimal module with no fixable/style diagnostics.
      fs.writeFileSync(sourcePath, "Namespace helpers\nEnd Namespace\n", "utf-8");
      const sourceUri = vscode.Uri.file(sourcePath);

      const entries = new Map<string, vscode.Diagnostic[]>();
      const originalCreate = vscode.languages.createDiagnosticCollection;
      (vscode.languages as any).createDiagnosticCollection = () => ({
        set: (uri: vscode.Uri, diags: vscode.Diagnostic[]) => {
          entries.set(uri.toString().toLowerCase(), diags);
        },
        get: (uri: vscode.Uri) => entries.get(uri.toString().toLowerCase()),
        delete: (uri: vscode.Uri) => {
          entries.delete(uri.toString().toLowerCase());
        },
        clear: () => entries.clear(),
        dispose: () => undefined,
      });

      try {
        const { DiagnosticService } = await import("../../services/diagnostic-service");
        DiagnosticService.__resetForTests();
        DiagnosticService.initialize({ subscriptions: [] } as any);

        // Seed stale Problems as if a prior workspace lint ran on dirty content.
        const stale = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 5),
          "stale",
          vscode.DiagnosticSeverity.Warning,
        );
        stale.code = "missing-then";
        DiagnosticService.replaceDiagnosticsFromBatch([{ uri: sourceUri, diagnostics: [stale] }]);
        assert.ok(entries.has(sourceUri.toString().toLowerCase()));

        const result = await internals.applyFixesToUris([sourceUri], { save: true });
        assert.equal(result.filesFixed, 0);
        assert.equal(
          entries.has(sourceUri.toString().toLowerCase()),
          false,
          "workspace fix must clear Problems when disk is already clean",
        );
      } finally {
        (vscode.languages as any).createDiagnosticCollection = originalCreate;
      }
    });
  });
});
