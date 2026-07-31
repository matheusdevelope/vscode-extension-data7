import "../_setup/global-hooks";
import assert from "node:assert/strict";
import { describe, test, beforeEach } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "../../platform/vscode-api";
import { AnalysisProgram } from "../../analysis/analysis-program";
import { LanguageProcessor } from "../../analysis/language-processor";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { withTempDirSync } from "../_helpers/temp-dir";
import { resetMockWorkspace } from "../_helpers/mock-doc";

/**
 * File lifecycle contract (REFACTOR-ANALYSIS-ENGINE.md §1.5). Closing a tab and
 * deleting a file used to go through the same `close()` call, so the two
 * opposite intents — "free memory, keep the file in the program" and "the file
 * is gone" — were indistinguishable.
 */
describe("AnalysisProgram file lifecycle", () => {
  const source = (namespace: string): string =>
    [
      `Namespace ${namespace}`,
      "   Class TThing",
      "      Public Sub Run()",
      "      End Sub",
      "   End Class",
      "End Namespace",
    ].join("\n");

  beforeEach(() => {
    resetMockWorkspace();
    AnalysisProgram.resetForTests();
    LanguageProcessor.getInstance().clearCache();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
  });

  test("closing a tab frees the snapshot but keeps the file indexed", () => {
    withTempDirSync((dir) => {
      const filePath = path.join(dir, "mod_keep.bas");
      fs.writeFileSync(filePath, source("mod_keep"), "utf-8");
      const uri = vscode.Uri.file(filePath).toString();

      const program = AnalysisProgram.getInstance();
      program.open(uri, source("mod_keep"), 1);
      assert.ok(program.getSnapshot(uri), "opening must create a snapshot");

      program.closeDocument(uri);

      assert.equal(program.getSnapshot(uri), undefined, "the snapshot must be released");
      assert.ok(
        program.getWorkspaceIndex().getFileSymbols(uri),
        "a closed workspace file is still part of the program",
      );
    });
  });

  test("deleting a file also drops its symbols", () => {
    withTempDirSync((dir) => {
      const filePath = path.join(dir, "mod_gone.bas");
      fs.writeFileSync(filePath, source("mod_gone"), "utf-8");
      const uri = vscode.Uri.file(filePath).toString();

      const program = AnalysisProgram.getInstance();
      program.open(uri, source("mod_gone"), 1);
      fs.rmSync(filePath);

      program.deleteFile(uri);

      assert.equal(program.getSnapshot(uri), undefined);
      assert.equal(
        program.getWorkspaceIndex().getFileSymbols(uri),
        undefined,
        "a deleted file must not keep resolving types",
      );
    });
  });

  test("rename moves symbols to the new uri in a single transition", () => {
    withTempDirSync((dir) => {
      const oldPath = path.join(dir, "mod_old.bas");
      const newPath = path.join(dir, "mod_new.bas");
      fs.writeFileSync(oldPath, source("mod_moved"), "utf-8");
      const oldUri = vscode.Uri.file(oldPath).toString();
      const newUri = vscode.Uri.file(newPath).toString();

      const program = AnalysisProgram.getInstance();
      program.open(oldUri, source("mod_moved"), 1);
      const indexer = program.getWorkspaceIndex();
      assert.ok(indexer.getFileSymbols(oldUri));

      fs.renameSync(oldPath, newPath);
      program.renameFile(oldUri, newUri);

      assert.equal(indexer.getFileSymbols(oldUri), undefined, "the old uri must be gone");
      const moved = indexer.getFileSymbols(newUri);
      assert.ok(moved, "the new uri must be indexed");
      assert.ok(
        moved.symbols.every((symbol) => symbol.fileUri === newUri),
        "every symbol must point at the new uri",
      );
      assert.equal(program.getSnapshot(oldUri), undefined);
    });
  });

  test("rename never leaves the old uri declaring the namespace", () => {
    withTempDirSync((dir) => {
      const oldPath = path.join(dir, "mod_decl.bas");
      const newPath = path.join(dir, "renamed.bas");
      fs.writeFileSync(oldPath, source("mod_decl"), "utf-8");
      const oldUri = vscode.Uri.file(oldPath).toString();
      const newUri = vscode.Uri.file(newPath).toString();

      const program = AnalysisProgram.getInstance();
      program.open(oldUri, source("mod_decl"), 1);

      fs.renameSync(oldPath, newPath);
      program.renameFile(oldUri, newUri);

      const declarers = program.getWorkspaceIndex().getDeclaringFileUris("mod_decl");
      assert.equal(declarers.length, 1);
      assert.equal(declarers[0]?.toLowerCase(), newUri.toLowerCase());
    });
  });

  test("matchesContent recognizes the buffer the program already analyzed", () => {
    withTempDirSync((dir) => {
      const filePath = path.join(dir, "mod_same.bas");
      const text = source("mod_same");
      fs.writeFileSync(filePath, text, "utf-8");
      const uri = vscode.Uri.file(filePath).toString();

      const program = AnalysisProgram.getInstance();
      program.open(uri, text, 1);

      assert.equal(program.matchesContent(uri, text), true, "a save of the same text is a no-op");
      assert.equal(program.matchesContent(uri, `${text}\n' edit`), false);
      assert.equal(program.matchesContent("file:///never-seen.bas", text), false);
    });
  });
});
