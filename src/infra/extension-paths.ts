import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type * as vscode from "vscode";

/**
 * Single source of truth for filesystem paths owned by the extension.
 *
 * Lives in `infra/` (a leaf) so that any layer of the codebase can read the
 * private-modules repository path without having to depend on the heavier
 * `RepositoryService` in `services/`. Concretely:
 *
 *  - `services/repository-service.ts` initialises and writes to this path.
 *  - `analysis/module-resolver.ts` reads it to resolve `Imports MyModule`
 *    links without having to cross the architectural fence into `services/`.
 *
 * Callers must call {@link initializeExtensionPaths} from `extension.ts`
 * during activation. The pre-activation fallback (`~/.data7_extension/repository`)
 * exists so unit tests and pre-`activate()` code paths still resolve to a
 * usable directory.
 */

let initializedRepoBasPath: string | undefined;

const FALLBACK_REPO_DIR = path.join(os.homedir(), ".data7_extension", "repository");

/**
 * Computes and caches the per-extension repository path. Should be called once
 * from `extension.ts#activate(context)` before any consumer reads
 * {@link getRepoBasPath}.
 */
export function initializeExtensionPaths(context: vscode.ExtensionContext): void {
  initializedRepoBasPath = path.join(context.globalStorageUri.fsPath, "repository");
  ensureDirectory(initializedRepoBasPath);
}

/**
 * Returns the absolute path of the private-modules repository folder. Falls
 * back to `~/.data7_extension/repository` when the activation initialiser
 * has not run yet (test environment).
 */
export function getRepoBasPath(): string {
  if (initializedRepoBasPath) return initializedRepoBasPath;
  ensureDirectory(FALLBACK_REPO_DIR);
  return FALLBACK_REPO_DIR;
}

/**
 * Test-only hook: clears the cached path so the next call recomputes the
 * fallback. Production code never calls this.
 */
export function __resetExtensionPathsForTests(): void {
  initializedRepoBasPath = undefined;
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
