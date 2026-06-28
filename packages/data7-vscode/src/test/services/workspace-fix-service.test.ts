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
});
