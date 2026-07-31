import "./vscode-mock"; // must come first: installs the require('vscode') override

import { beforeEach } from "node:test";
import * as vscode from "vscode";
import {
  createVscodeAnalysisHost,
  installAnalysisHost,
  installVscodeApi,
  WorkspaceSymbolIndexer,
} from "@data7/core";

installVscodeApi(vscode as unknown as Parameters<typeof installVscodeApi>[0]);
installAnalysisHost(createVscodeAnalysisHost());

/**
 * Global `beforeEach` hook applied to every test file that imports this module
 * (transitively or directly). Centralises the reset steps that every
 * provider/linter test needs:
 *
 *  1. Clear the `WorkspaceSymbolIndexer` singleton cache so test order does
 *     not matter.
 *  2. Reset the array backing `vscode.workspace.textDocuments` so a previous
 *     test cannot leak documents into the next one.
 *  3. Reinstall the VS Code-backed AnalysisHost so open-document lookups stay
 *     wired to the mock `textDocuments` array.
 *
 * Importing this module is idempotent (Node caches modules) — the hook is
 * registered exactly once per test file, even if `setup.ts` is imported by
 * multiple helpers transitively.
 */
beforeEach(() => {
  WorkspaceSymbolIndexer.getInstance().__resetForTests();
  (vscode.workspace.textDocuments as unknown as unknown[]).length = 0;
  installAnalysisHost(createVscodeAnalysisHost());
});
