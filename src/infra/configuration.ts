import * as vscode from "vscode";
import { CONFIG_NAMESPACE } from "./constants";

const SECTION = CONFIG_NAMESPACE;

export type DiagnosticSeverityOverride = "error" | "warning" | "info" | "hint" | "off";

export interface Data7Configuration {
  readonly executorPath: string;
  readonly sharedModulesPath: string;
  readonly userCode: number;
  readonly companyCode: number;
  readonly branchCode: number;
  readonly databaseConnectionId: string;
  readonly enableAutoSync: boolean;
  readonly exclude: readonly string[];
  readonly diagnosticSeverity: Readonly<Record<string, DiagnosticSeverityOverride>>;
  readonly autoFormatOnSave: boolean;
}

/**
 * Default `data7.exclude` patterns. `data7_modules/**` is intentionally NOT
 * here: those files are local copies of shared dependencies that the indexer,
 * autocomplete, hover and go-to-definition MUST see — otherwise every type
 * declared inside a dependency would surface as `unknown-member` or
 * `unused-import` in the consuming project. Diagnostics on `data7_modules/`
 * are silenced separately via {@link isReadOnlyModuleFile} so the user does
 * not see lint warnings on generated content.
 */
const DEFAULT_EXCLUDE: readonly string[] = ["**/node_modules/**", "**/.git/**", "**/out/**"];

/**
 * Reads the `data7.*` configuration with sane defaults that mirror
 * `package.json#contributes.configuration`. When any of these settings is
 * renamed, only this helper needs to change.
 */
export function readConfiguration(): Data7Configuration {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return {
    executorPath: cfg.get<string>("executorPath") ?? "",
    sharedModulesPath: cfg.get<string>("sharedModulesPath") ?? "",
    userCode: cfg.get<number>("userCode") ?? 1,
    companyCode: cfg.get<number>("companyCode") ?? 1,
    branchCode: cfg.get<number>("branchCode") ?? 1,
    databaseConnectionId: cfg.get<string>("databaseConnectionId") ?? "",
    enableAutoSync: cfg.get<boolean>("enableAutoSync") ?? true,
    exclude: cfg.get<string[]>("exclude") ?? DEFAULT_EXCLUDE,
    diagnosticSeverity:
      cfg.get<Record<string, DiagnosticSeverityOverride>>("diagnosticSeverity") ?? {},
    autoFormatOnSave: cfg.get<boolean>("autoFormatOnSave") ?? false,
  };
}

/**
 * Converts a `data7.diagnosticSeverity` override to a vscode `DiagnosticSeverity`,
 * or `undefined` when the user set it to `"off"` (the diagnostic should be skipped).
 * Falls back to the supplied default when no override exists for the given code.
 */
export function resolveDiagnosticSeverity(
  code: string,
  defaultSeverity: vscode.DiagnosticSeverity,
  overrides: Readonly<Record<string, DiagnosticSeverityOverride>> = readConfiguration()
    .diagnosticSeverity,
): vscode.DiagnosticSeverity | undefined {
  // With `noUncheckedIndexedAccess`, the lookup is already `T | undefined` —
  // no cast needed. The runtime fallthrough path is reachable via the guard.
  const ov = overrides[code];
  if (!ov) return defaultSeverity;
  switch (ov) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    case "hint":
      return vscode.DiagnosticSeverity.Hint;
    case "off":
      return undefined;
  }
}

/**
 * `true` when the given absolute path matches any of the `data7.exclude` globs.
 * Uses VS Code's `RelativePattern` semantics indirectly — we keep it lightweight
 * here by matching the suffix portion using a basic glob-to-regex.
 *
 * Performance: compiled regexes are cached in `globRegexCache` so a workspace
 * scanning 1000+ files does not re-compile the same pattern 1000+ times.
 */
export function isExcluded(
  filePath: string,
  patterns: readonly string[] = readConfiguration().exclude,
): boolean {
  if (patterns.length === 0) return false;
  const normalized = filePath.replace(/\\/g, "/");
  for (const pattern of patterns) {
    if (cachedGlobToRegex(pattern).test(normalized)) return true;
  }
  return false;
}

const globRegexCache = new Map<string, RegExp>();

/** Returns a cached `RegExp` compiled from `glob` (anchored to whole-path). */
function cachedGlobToRegex(glob: string): RegExp {
  const cached = globRegexCache.get(glob);
  if (cached) return cached;
  const compiled = globToRegex(glob);
  globRegexCache.set(glob, compiled);
  return compiled;
}

/**
 * Test-only hook: clears the compiled regex cache. Needed when tests mutate
 * the set of patterns between cases so a stale entry isn't reused.
 */
export function __resetGlobCacheForTests(): void {
  globRegexCache.clear();
}

function globToRegex(glob: string): RegExp {
  let regex = "^";
  for (let i = 0; i < glob.length; i++) {
    // `i < glob.length` guarantees `glob[i]` is defined; the `?? ""` keeps
    // the runtime semantics identical while satisfying the checker.
    const c = glob[i] ?? "";
    if (c === "*") {
      if (glob[i + 1] === "*") {
        regex += ".*";
        i++;
      } else regex += "[^/]*";
    } else if (c === "?") {
      regex += ".";
    } else if (".+^$|()[]{}\\".includes(c)) {
      regex += "\\" + c;
    } else {
      regex += c;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

/**
 * Returns the underlying `WorkspaceConfiguration` for code paths that need
 * to call `.update()` (still scoped to the `data7` section).
 */
export function getRawConfiguration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(SECTION);
}

/**
 * `true` when `filePath` lives inside a `data7_modules/` folder. These files
 * are generated copies of shared dependencies — the indexer reads them for
 * type resolution, but diagnostics and other "user code"-only behaviour must
 * skip them.
 */
export function isReadOnlyModuleFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)data7_modules\//.test(normalized);
}

/**
 * Returns the first `data7.exclude` glob that, if applied to the indexer,
 * would block `data7_modules/` from being indexed. Used by the activation
 * layer to surface a one-shot migration warning to users whose existing
 * `settings.json` still carries the legacy `**\/data7_modules/**` pattern
 * inherited from the pre-fix default (the extension now indexes that folder
 * by design — see {@link DEFAULT_EXCLUDE}).
 *
 * Returns `undefined` when no offending pattern is present.
 */
export function findLegacyDataModulesExcludePattern(
  patterns: readonly string[] = readConfiguration().exclude,
): string | undefined {
  const probe = "/workspace/data7_modules/mod_x.bas";
  return patterns.find((pattern) => cachedGlobToRegex(pattern).test(probe));
}

/**
 * Subscribe to live changes that affect any `data7.*` setting. The callback
 * receives a fresh, typed snapshot.
 */
export function onConfigurationChanged(
  listener: (config: Data7Configuration) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      listener(readConfiguration());
    }
  });
}
