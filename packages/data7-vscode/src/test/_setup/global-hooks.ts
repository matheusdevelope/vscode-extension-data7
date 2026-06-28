import "./vscode-mock"; // must come first: installs the require('vscode') override

import { beforeEach } from "node:test";
import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "@data7/core";

/**
 * Global `beforeEach` hook applied to every test file that imports this module
 * (transitively or directly). Centralises the two reset steps that every
 * provider/linter test needs:
 *
 *  1. Clear the `WorkspaceSymbolIndexer` singleton cache so test order does
 *     not matter.
 *  2. Reset the array backing `vscode.workspace.textDocuments` so a previous
 *     test cannot leak documents into the next one.
 *
 * Importing this module is idempotent (Node caches modules) — the hook is
 * registered exactly once per test file, even if `setup.ts` is imported by
 * multiple helpers transitively.
 */
beforeEach(() => {
  WorkspaceSymbolIndexer.getInstance().__resetForTests();
  (vscode.workspace.textDocuments as unknown as unknown[]).length = 0;
});
