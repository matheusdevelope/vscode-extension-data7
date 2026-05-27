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

const DEFAULT_EXCLUDE: readonly string[] = [
  "**/node_modules/**",
  "**/data7_modules/**",
  "**/.git/**",
  "**/out/**",
];

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
  // `Record<string, X>` types lookups as `X` rather than `X | undefined`
  // because we don't enable `noUncheckedIndexedAccess` globally. Cast back
  // to the realistic runtime type so the fallthrough branch is reachable.
  const ov = overrides[code] as DiagnosticSeverityOverride | undefined;
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
    const c = glob[i];
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
