/**
 * Path resolution helpers used exclusively by the MCP server.
 *
 * The server runs OUTSIDE the extension host as an isolated Node child process,
 * so it cannot rely on `vscode.ExtensionContext.extensionUri`. Instead, it
 * looks for the repository root (`docs/`) by walking up from `__dirname`, or
 * accepts an explicit `DATA7_DOCS_ROOT` env var / `--docs-root=<path>` flag
 * for cases where the binary is decoupled from the source tree (production
 * VSIX install).
 *
 * Resolution order:
 *   1. CLI flag `--docs-root=<path>` parsed by `parseCliArgs` in `server.ts`.
 *   2. Env var `DATA7_DOCS_ROOT`.
 *   3. Walk up from this file looking for a sibling `docs/` folder.
 *
 * The MCP client config produced by `MCPService.previewClientConfig`
 * automatically passes the extension install path via `--docs-root`, so end
 * users do not need to set anything manually.
 */
import * as fs from "fs";
import * as path from "path";

/** Singleton cache so we resolve only once per process. */
let cachedDocsRoot: string | undefined;

/**
 * Override the auto-detected docs root with a value supplied by the CLI
 * argument parser. Must be called before any resource handler reads files.
 */
export function setDocsRootOverride(override: string | undefined): void {
  cachedDocsRoot = override;
}

/**
 * Returns the absolute path to the repository's `docs/` folder, throwing if
 * it cannot be located. Caches the result for subsequent calls.
 */
export function getDocsRoot(): string {
  if (cachedDocsRoot && fs.existsSync(cachedDocsRoot)) return cachedDocsRoot;

  const fromEnv = process.env.DATA7_DOCS_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) {
    cachedDocsRoot = fromEnv;
    return cachedDocsRoot;
  }

  // Walk up from __dirname looking for `docs/`. When running compiled from
  // `out/mcp/utils/paths.js` we need to walk up 4 levels to reach the repo
  // root; when running from `src/mcp/utils/paths.ts` (ts-node, tests), 3.
  let cursor = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cursor, "docs");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      cachedDocsRoot = candidate;
      return cachedDocsRoot;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  throw new Error(
    "MCP server could not locate docs/ folder. " +
      "Pass --docs-root=<absolute-path> or set DATA7_DOCS_ROOT.",
  );
}

/**
 * Same idea as `getDocsRoot` but for the compiled `out/mcp/data/` folder that
 * holds the bundles produced by `scripts/extract-official-articles.js` (and
 * future extractors). Returns `undefined` when the folder is missing instead
 * of throwing — Resources fall back to `docs/` filesystem reads in that case.
 */
export function getDataRoot(): string | undefined {
  // Walk up from __dirname looking for `out/mcp/data/`.
  let cursor = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cursor, "out", "mcp", "data");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

/**
 * Returns the version string baked into the published `package.json`. Used
 * by the `data7://meta/snapshot` Resource so clients can detect server
 * version drift after a `npm update`.
 */
export function getServerVersion(): string {
  let cursor = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(cursor, "package.json");
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf-8");
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          "version" in parsed &&
          typeof parsed.version === "string"
        ) {
          return (parsed as { version: string }).version;
        }
      } catch {
        // fall through
      }
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return "0.0.0";
}
