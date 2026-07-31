import "../_setup/global-hooks";
import { afterEach, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  createNodeAnalysisHost,
  createVscodeAnalysisHost,
  getAnalysisHost,
  installAnalysisHost,
  resetAnalysisHostForTests,
  workspaceFolderFromPath,
} from "../../analysis/analysis-host";
import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";
import { AnalysisProgram } from "../../analysis/analysis-program";
import { Uri } from "../../platform/vscode-api";
import { registerOpenDocument, resetMockWorkspace } from "../_helpers/mock-doc";

describe("AnalysisHost", () => {
  afterEach(() => {
    resetMockWorkspace();
    resetAnalysisHostForTests();
    installAnalysisHost(createVscodeAnalysisHost());
    WorkspaceSymbolIndexer.getInstance().__resetForTests();
    AnalysisProgram.resetForTests();
  });

  test("node host treats setOpenDocuments as the open-file set for isFileValid", () => {
    const host = createNodeAnalysisHost();
    installAnalysisHost(host);

    // Avoid the synthetic `file:///proj/` allow-list used by build fixtures.
    const uri = "file:///headless-open/open_only.bas";
    const indexer = WorkspaceSymbolIndexer.getInstance();
    assert.equal(indexer.isFileValid(uri), false);

    host.setOpenDocuments?.([{ uri, version: 1, getText: () => "Namespace ns\nEnd Namespace" }]);
    assert.equal(indexer.isFileValid(uri), true);

    host.setOpenDocuments?.([]);
    assert.equal(indexer.isFileValid(uri), false);
  });

  test("node host fs reads and writes through the injected filesystem", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "data7-host-"));
    const filePath = path.join(root, "note.txt");
    const host = createNodeAnalysisHost();
    installAnalysisHost(host);

    host.fs.writeFileSync(filePath, "hello");
    assert.equal(host.fs.existsSync(filePath), true);
    assert.equal(host.fs.readFileSync(filePath), "hello");
  });

  test("vscode host surfaces mock textDocuments as open documents", () => {
    installAnalysisHost(createVscodeAnalysisHost());
    const uri = "file:///proj/from_vscode.bas";
    registerOpenDocument(uri, "proj/from_vscode.bas");

    const open = getAnalysisHost().getOpenDocument(uri);
    assert.ok(open, "vscode host must see the mock open document");
    assert.equal(open.uri.toLowerCase(), uri.toLowerCase());
  });

  test("AnalysisProgram.createDetached keeps the injected host", () => {
    const folders = [workspaceFolderFromPath(path.join(os.tmpdir(), "data7-ws"))];
    const host = createNodeAnalysisHost({ workspaceFolders: folders });
    const indexer = WorkspaceSymbolIndexer.createDetached();
    const program = AnalysisProgram.createDetached(indexer, host);

    assert.equal(program.getHost(), host);
    assert.deepEqual(program.getHost().getWorkspaceFolders(), folders);
  });

  test("preferWorkspaceMatch uses host workspace folders, not vscode globals", () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "data7-ws-match-"));
    const workspaceFile = path.join(workspaceRoot, "src", "in_ws.bas");
    fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
    fs.writeFileSync(workspaceFile, "Namespace ns_ws\n  Class InWs\n  End Class\nEnd Namespace");

    const outsideFile = path.join(os.tmpdir(), `data7-outside-${Date.now()}.bas`);
    fs.writeFileSync(outsideFile, "Namespace ns_out\n  Class InWs\n  End Class\nEnd Namespace");

    const host = createNodeAnalysisHost({
      workspaceFolders: [workspaceFolderFromPath(workspaceRoot)],
    });
    installAnalysisHost(host);

    const indexer = WorkspaceSymbolIndexer.createDetached();
    indexer.updateFileContent(
      Uri.file(workspaceFile).toString(),
      fs.readFileSync(workspaceFile, "utf-8"),
    );
    indexer.updateFileContent(
      Uri.file(outsideFile).toString(),
      fs.readFileSync(outsideFile, "utf-8"),
    );

    const hit = indexer.findSymbolByName("InWs");
    assert.ok(hit);
    assert.equal(
      path.normalize(Uri.parse(hit.fileUri).fsPath).toLowerCase(),
      path.normalize(workspaceFile).toLowerCase(),
    );
  });
});
