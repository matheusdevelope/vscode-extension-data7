import "../_setup/global-hooks";
import * as path from "node:path";
import * as vscode from "vscode";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { mockTextDocuments, registerOpenDocument, resetMockWorkspace } from "../_helpers/mock-doc";

/**
 * Cross-platform path helpers. Tests must not hardcode `c:\\...` or
 * forward-slash URIs because the same suite runs on Windows developer
 * machines and on Linux GitHub Actions runners.
 *
 * - `fakeAbsPath(...segments)` produces an absolute path that is invented
 *   (never exists on disk) and uses the host OS path separator. On Windows
 *   we anchor with a drive letter; on POSIX we anchor at `/`.
 * - `fileUriFor(absPath)` reuses `vscode.Uri.file().toString()` so the URI
 *   format always matches what the indexer would produce in production.
 */
function fakeAbsPath(...segments: string[]): string {
  return process.platform === "win32"
    ? path.join("c:\\", ...segments)
    : path.join("/", ...segments);
}

function fileUriFor(absPath: string): string {
  return vscode.Uri.file(absPath).toString();
}

describe("WorkspaceSymbolIndexer", () => {
  describe("validateCache", () => {
    test("keeps files that exist on disk, prunes orphan in-memory entries", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();

      // (a) Real file on disk: use this test's own source path. Goes through
      // vscode.Uri.file() so the URI matches what the indexer emits in
      // production on the same OS.
      const realFileUri = fileUriFor(__filename);
      indexer.updateFileContent(realFileUri, "Namespace ns\nEnd Namespace");

      // (b) Phantom URI registered as "open in editor" so it is initially valid.
      const phantomUri = fileUriFor(fakeAbsPath("dummy", "non_existent_file.bas"));
      registerOpenDocument(phantomUri);
      indexer.updateFileContent(phantomUri, "Namespace ns2\nEnd Namespace");

      assert.ok(indexer.getFileSymbols(realFileUri));
      assert.ok(indexer.getFileSymbols(phantomUri));

      // Close the phantom (remove it from open documents).
      resetMockWorkspace();

      indexer.validateCache();

      assert.ok(
        indexer.getFileSymbols(realFileUri),
        "a file that exists on disk must remain cached",
      );
      assert.equal(
        indexer.getFileSymbols(phantomUri),
        undefined,
        "a phantom file that was closed must be pruned",
      );
    });
  });

  describe("renameWorkspaceFolder / deleteWorkspaceFolder", () => {
    test("rename moves cached entries to the new folder URIs", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const oldFolder = fakeAbsPath("dummy_project", "src", "modules", "mod_card");
      const file1 = fakeAbsPath("dummy_project", "src", "modules", "mod_card", "form", "card.bas");
      const file2 = fakeAbsPath("dummy_project", "src", "modules", "mod_card", "helper.bas");
      const file1Uri = fileUriFor(file1);
      const file2Uri = fileUriFor(file2);

      registerOpenDocument(file1Uri, file1);
      registerOpenDocument(file2Uri, file2);
      indexer.updateFileContent(file1Uri, "Namespace ns_card\nEnd Namespace");
      indexer.updateFileContent(file2Uri, "Namespace ns_helper\nEnd Namespace");

      assert.ok(indexer.getFileSymbols(file1Uri));
      assert.ok(indexer.getFileSymbols(file2Uri));

      const newFolder = fakeAbsPath("dummy_project", "src", "mod_card");
      const newFile1 = fakeAbsPath("dummy_project", "src", "mod_card", "form", "card.bas");
      const newFile2 = fakeAbsPath("dummy_project", "src", "mod_card", "helper.bas");
      const newFile1Uri = fileUriFor(newFile1);
      const newFile2Uri = fileUriFor(newFile2);

      // Register the new locations as "open" so isFileValid accepts them.
      resetMockWorkspace();
      registerOpenDocument(newFile1Uri, newFile1);
      registerOpenDocument(newFile2Uri, newFile2);

      indexer.renameWorkspaceFolder(oldFolder, newFolder);

      assert.equal(indexer.getFileSymbols(file1Uri), undefined, "old URI must be evicted");
      assert.ok(indexer.getFileSymbols(newFile1Uri), "new URI must be present");
    });

    test("delete removes every entry under the folder prefix", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const folder = fakeAbsPath("dummy_project", "src", "mod_card");
      const file = fakeAbsPath("dummy_project", "src", "mod_card", "form", "card.bas");
      const uri = fileUriFor(file);

      registerOpenDocument(uri, file);
      indexer.updateFileContent(uri, "Namespace ns_card\nEnd Namespace");
      assert.ok(indexer.getFileSymbols(uri));

      indexer.deleteWorkspaceFolder(folder);
      assert.equal(indexer.getFileSymbols(uri), undefined);
    });
  });

  describe("findSymbolByName — workspace-first preference", () => {
    afterEach(() => {
      // Tests in this block mutate `workspaceFolders`; revert so siblings
      // see the default `undefined`.
      (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = undefined;
    });

    test("returns the workspace copy when a duplicate symbol exists outside the workspace", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();

      const workspaceDir = fakeAbsPath("dummy_project");
      const workspaceFile = fakeAbsPath("dummy_project", "data7_modules", "mod_pipeline_form.bas");
      const repoFile = fakeAbsPath(".data7_extension", "repository", "mod_pipeline_form.bas");
      const workspaceUri = fileUriFor(workspaceFile);
      const repoUri = fileUriFor(repoFile);

      registerOpenDocument(workspaceUri, workspaceFile);
      registerOpenDocument(repoUri, repoFile);

      const namespaceCode = `Namespace mod_pipeline_form
   Class TPipelineForm
   End Class
End Namespace`;
      // Cache the OUTSIDE-workspace copy first so the regression also
      // proves the preference walks every cached entry — not just the
      // first inserted one.
      indexer.updateFileContent(repoUri, namespaceCode);
      indexer.updateFileContent(workspaceUri, namespaceCode);

      (
        vscode.workspace as unknown as { workspaceFolders: vscode.WorkspaceFolder[] }
      ).workspaceFolders = [
        { uri: vscode.Uri.file(workspaceDir), name: "dummy_project", index: 0 },
      ];

      const match = indexer.findSymbolByName("TPipelineForm");
      assert.ok(match);
      assert.equal(match.fileUri, workspaceUri);
    });

    test("falls back to the first cached match when no workspace folder is open", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const orphanFile = fakeAbsPath("nowhere", "mod_x.bas");
      const orphanUri = fileUriFor(orphanFile);
      registerOpenDocument(orphanUri, orphanFile);
      indexer.updateFileContent(orphanUri, "Namespace mod_x\nEnd Namespace");

      const match = indexer.findSymbolByName("mod_x");
      assert.ok(match);
      assert.equal(match.fileUri, orphanUri);
    });
  });

  describe("dynamic cache validation on lookup", () => {
    test("purges stale symbols whose file is neither on disk nor open in editor", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const staleAbs = fakeAbsPath("dummy_project", "src", "stale_file_not_existing.bas");
      const staleUri = fileUriFor(staleAbs);
      registerOpenDocument(staleUri, staleAbs);

      indexer.updateFileContent(
        staleUri,
        `
Namespace ns_stale
  Class TStaleClass
    Sub StaleMethod()
    End Sub
  End Class
End Namespace
      `,
      );

      assert.notEqual(
        indexer.getFileSymbols(staleUri),
        undefined,
        'initially cached because the file is "open"',
      );

      // Close the file.
      mockTextDocuments.length = 0;
      assert.equal(indexer.isFileValid(staleUri), false);

      const symbol = indexer.findSymbolByName("TStaleClass");
      assert.equal(symbol, undefined, "stale symbol must be filtered out");
      assert.equal(indexer.getFileSymbols(staleUri), undefined, "stale file must be purged");
    });
  });

  describe("O(1) search cache maps", () => {
    test("returns indexed symbols by name and by container, invalidating correctly on updates", () => {
      const indexer = WorkspaceSymbolIndexer.getInstance();
      const file = fakeAbsPath("dummy_project", "src", "search_maps.bas");
      const uri = fileUriFor(file);
      registerOpenDocument(uri, file);

      indexer.updateFileContent(
        uri,
        `
Namespace ns_search
  Class TSearchClass
    Public Sub Execute()
    End Sub
  End Class
End Namespace
        `,
      );

      // Search by name
      const nameHits = indexer.getSymbolsByName("TSearchClass");
      assert.equal(nameHits.length, 1);
      assert.equal(nameHits[0]?.name, "TSearchClass");
      assert.equal(nameHits[0]?.containerName, "ns_search");

      // Search by container
      const containerHits = indexer.getSymbolsByContainer("TSearchClass");
      assert.equal(containerHits.length, 1);
      assert.equal(containerHits[0]?.name, "Execute");
      assert.equal(containerHits[0]?.containerName, "TSearchClass");

      // Now update file to remove TSearchClass
      indexer.updateFileContent(
        uri,
        `
Namespace ns_search
  Class TOtherClass
  End Class
End Namespace
        `,
      );

      // Cache should be updated/invalidated
      const oldNameHits = indexer.getSymbolsByName("TSearchClass");
      assert.equal(oldNameHits.length, 0);

      const newNameHits = indexer.getSymbolsByName("TOtherClass");
      assert.equal(newNameHits.length, 1);
    });
  });
});
