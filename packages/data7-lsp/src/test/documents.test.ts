import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isBasicSourceUri,
  syncDocumentClose,
  syncDocumentDelete,
  syncDocumentOpenOrChange,
} from "../documents";
import {
  AnalysisProgram,
  WorkspaceSymbolIndexer,
  createNodeAnalysisHost,
  installAnalysisHost,
  resetAnalysisHostForTests,
} from "@data7/core";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("documents sync", () => {
  test("isBasicSourceUri accepts .bas and .d7b", () => {
    assert.equal(isBasicSourceUri("file:///x/mod.bas"), true);
    assert.equal(isBasicSourceUri("file:///x/mod.d7b"), true);
    assert.equal(isBasicSourceUri("file:///x/mod.txt"), false);
  });

  test("open/change updates AnalysisProgram; delete removes the file", () => {
    resetAnalysisHostForTests();
    installAnalysisHost(createNodeAnalysisHost());
    AnalysisProgram.resetForTests();
    WorkspaceSymbolIndexer.getInstance().__resetForTests();

    const uri = "file:///lsp-docs/mod_sync.bas";
    const doc = TextDocument.create(uri, "d7basic", 1, "Namespace Sync\nEnd Namespace");
    syncDocumentOpenOrChange(doc);

    const program = AnalysisProgram.getInstance();
    assert.ok(program.ensureParsed(uri, doc.getText(), doc.version));

    syncDocumentClose(uri);
    syncDocumentDelete(uri);
    assert.equal(
      WorkspaceSymbolIndexer.getInstance().getFileSymbols(uri),
      undefined,
      "delete must drop the indexed file",
    );
  });
});
