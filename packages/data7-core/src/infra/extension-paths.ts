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
let initializedExtensionRootPath: string | undefined;

const FALLBACK_REPO_DIR = path.join(os.homedir(), ".data7_extension", "repository");
function findFallbackCoreModulesDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "core_modules"),
    path.resolve(__dirname, "..", "..", "..", "..", "core_modules"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}
const FALLBACK_CORE_MODULES_DIR = findFallbackCoreModulesDir();

/**
 * Computes and caches the per-extension repository path. Should be called once
 * from `extension.ts#activate(context)` before any consumer reads
 * {@link getRepoBasPath}.
 */
export function initializeExtensionPaths(context: vscode.ExtensionContext): void {
  initializedExtensionRootPath = context.extensionUri.fsPath;
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
 * Returns the versioned internal core modules folder shipped with the extension.
 * These `.bas` files are copied into every project's `data7_modules/` during
 * dependency sync so they follow the normal Builder transpilation pipeline.
 */
export function getCoreModulesPath(): string {
  if (initializedExtensionRootPath) {
    return path.join(initializedExtensionRootPath, "core_modules");
  }
  return FALLBACK_CORE_MODULES_DIR;
}

/**
 * Returns the path of the 'modules' folder inside the extension root directory.
 * If running outside the extension context (e.g. tests), falls back to scanning parent directories.
 */
export function getOnlineModulesLocalPath(): string | undefined {
  if (initializedExtensionRootPath) {
    const p = path.join(initializedExtensionRootPath, "modules");
    if (fs.existsSync(p)) return p;
  }
  // Fallback: look for "modules" directory relative to __dirname
  const candidates = [
    path.resolve(__dirname, "..", "..", "modules"),
    path.resolve(__dirname, "..", "..", "..", "modules"),
    path.resolve(__dirname, "..", "..", "..", "..", "modules"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

/**
 * Test-only hook: clears the cached path so the next call recomputes the
 * fallback. Production code never calls this.
 */
export function __resetExtensionPathsForTests(): void {
  initializedRepoBasPath = undefined;
  initializedExtensionRootPath = undefined;
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

