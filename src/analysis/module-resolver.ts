import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { WorkspaceSymbolIndexer } from "./symbol-indexer";
import { getRepoBasPath } from "../infra/extension-paths";
import { escapeForRegex } from "../utils/regex-helpers";

/**
 * Resolves a Data7 namespace identifier (`Imports MyModule`) to the absolute
 * filesystem path of the `.bas` file that declares it.
 *
 * Resolution priority mirrors the language model:
 *
 *  1. **Workspace** — any `.bas` indexed by the workspace symbol indexer that
 *     declares `Namespace <name>`.
 *  2. **Private repository** — recursive scan under
 *     `getRepoBasPath()` (owned by `RepositoryService`, path published by
 *     `infra/extension-paths.ts`).
 *
 * The function is intentionally **pure** and lives in `analysis/` so both
 * providers (e.g. `document-link-provider`) and services can share it without
 * crossing the architectural fence between layers.
 *
 * System Library namespaces (`Forms`, `IO`, `SQL`, …) are intentionally
 * **not** resolved — their definitions live in TypeScript and would not be
 * useful to most users via "Go to file".
 */
export function resolveNamespaceFile(
  indexer: WorkspaceSymbolIndexer,
  namespace: string,
): string | undefined {
  const lowerNs = namespace.toLowerCase();
  const inWorkspace = indexer
    .getAllSymbols()
    .find((s) => s.kind === "namespace" && s.name.toLowerCase() === lowerNs);
  if (inWorkspace) {
    try {
      return vscode.Uri.parse(inWorkspace.fileUri).fsPath;
    } catch {
      return undefined;
    }
  }

  const repoPath = getRepoBasPath();
  if (!fs.existsSync(repoPath)) return undefined;
  try {
    return findNamespaceInDirectory(repoPath, namespace);
  } catch {
    return undefined;
  }
}

function findNamespaceInDirectory(dir: string, namespace: string): string | undefined {
  const targetRegex = new RegExp(`^\\s*Namespace\\s+${escapeForRegex(namespace)}\\b`, "i");
  const entries = safeReaddir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const nested = findNamespaceInDirectory(full, namespace);
      if (nested) return nested;
    } else if (stat.isFile() && entry.toLowerCase().endsWith(".bas")) {
      try {
        const text = fs.readFileSync(full, "utf-8");
        // Read only the first 40 lines — namespace declarations live at the top.
        for (const line of text.split(/\r?\n/, 40)) {
          if (targetRegex.test(line)) return full;
        }
      } catch {
        // ignore unreadable
      }
    }
  }
  return undefined;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
