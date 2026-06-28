import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { WorkspaceSymbolIndexer } from "./symbol-indexer";
import { getCoreModulesPath, getRepoBasPath } from "../infra/extension-paths";
import { DependencyScanner } from "./dependency-scanner";

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

  for (const modulePath of [getCoreModulesPath(), getRepoBasPath()]) {
    if (!fs.existsSync(modulePath)) continue;
    try {
      const found = findNamespaceInDirectory(modulePath, namespace);
      if (found) return found;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function findNamespaceInDirectory(dir: string, namespace: string): string | undefined {
  const lowerNamespace = namespace.toLowerCase();
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
        const declaresNamespace = DependencyScanner.getDeclaredNamespaces(text).some(
          (declared) => declared.toLowerCase() === lowerNamespace,
        );
        if (declaresNamespace) return full;
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
