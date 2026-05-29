/**
 * Workspace loader — populates a detached `WorkspaceSymbolIndexer`
 * with the `.bas` files of a workspace folder so `data7_lint_bas` and
 * `data7_lint_project` can resolve cross-file symbols (Imports, type
 * declarations) just like the live extension does.
 *
 * The `--workspace=<path>` CLI flag drives this loader. When the flag
 * is not provided we run in "standalone" mode and the linter only sees
 * the snippets the agent passes inline.
 *
 * Architectural notes:
 *  - This file is OUT of the extension host. It loads
 *    `WorkspaceSymbolIndexer.createDetached()` rather than the singleton
 *    so test runs and concurrent MCP sessions never share state.
 *  - `installVscodeShim` MUST have been called before this module
 *    imports `symbol-indexer`, otherwise `import * as vscode from
 *    "vscode"` would throw.
 */
import * as fs from "fs";
import * as path from "path";

import { WorkspaceSymbolIndexer } from "../../analysis/symbol-indexer";

const BAS_EXTENSIONS = new Set([".bas", ".d7b"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", "out", "dist"]);

function isIgnored(name: string): boolean {
  return IGNORED_DIRS.has(name.toLowerCase());
}

function* walkBas(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkBas(full);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (BAS_EXTENSIONS.has(ext)) yield full;
  }
}

interface LoadOptions {
  /** Optional cap on the number of files indexed (safety net for huge trees). */
  readonly maxFiles?: number;
}

export interface WorkspaceLoadResult {
  readonly indexer: WorkspaceSymbolIndexer;
  readonly filesIndexed: number;
}

/**
 * Builds a fresh `WorkspaceSymbolIndexer` (`createDetached()`) seeded
 * with every `.bas` file under `workspacePath`. The indexer is returned
 * for the caller to share across consecutive lint requests in the same
 * MCP session — re-loading on every call would be wasteful.
 */
export function loadWorkspaceIntoIndexer(
  workspacePath: string,
  options: LoadOptions = {},
): WorkspaceLoadResult {
  const indexer = WorkspaceSymbolIndexer.createDetached();
  if (!fs.existsSync(workspacePath)) return { indexer, filesIndexed: 0 };

  const cap = options.maxFiles ?? 10000;
  let count = 0;
  for (const file of walkBas(workspacePath)) {
    if (count >= cap) break;
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const uri = "file:///" + file.replace(/\\/g, "/");
    indexer.updateFileContent(uri, content);
    count++;
  }
  return { indexer, filesIndexed: count };
}

/**
 * Returns a brand-new detached indexer with no preloaded content. Used
 * by `data7_lint_bas` in standalone mode (`--standalone`) when the
 * agent only sends inline snippets.
 */
export function createEmptyIndexer(): WorkspaceSymbolIndexer {
  return WorkspaceSymbolIndexer.createDetached();
}

/**
 * Adds (or replaces) the in-memory representation of a single `.bas`
 * file inside an existing indexer. Used by the snippet-driven lint
 * paths (`lint_bas` accepts a single `code` argument and treats it as
 * an untitled document at `file:///__inline__.bas`).
 */
export function setInlineDocument(
  indexer: WorkspaceSymbolIndexer,
  content: string,
  virtualUri = "file:///__inline__.bas",
): string {
  indexer.updateFileContent(virtualUri, content);
  return virtualUri;
}
