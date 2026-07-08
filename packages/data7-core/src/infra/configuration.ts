import * as vscode from "../platform/vscode-api";
import * as fs from "fs";
import * as path from "path";
import { CONFIG_NAMESPACE } from "./constants";
import type { Data7Configuration, DiagnosticSeverityOverride } from "./configuration-types";
import { DEFAULT_EXCLUDE, DEFAULT_FEATURES } from "./configuration-types";
import {
  DEFAULT_EXTENSION_SETTINGS,
  migrateLegacyVscodeConfiguration,
  normalizeExtensionSettings,
} from "./extension-settings";

const SECTION = CONFIG_NAMESPACE;

let extensionSettingsProvider: (() => Data7Configuration) | undefined;

/**
 * Installs the extension-owned settings store (globalStorage JSON). When set,
 * {@link readConfiguration} no longer reads `settings.json`.
 */
export function installExtensionSettingsProvider(provider: () => Data7Configuration): void {
  extensionSettingsProvider = provider;
}

/** Test hook: clears the installed provider. */
export function clearExtensionSettingsProviderForTests(): void {
  extensionSettingsProvider = undefined;
}

export type { Data7Configuration, DiagnosticSeverityOverride };

/**
 * Reads the active Data7 configuration. Prefers the extension settings file
 * when a provider was installed at activation; otherwise falls back to legacy
 * VS Code workspace settings (migration path only).
 */
export function readConfiguration(): Data7Configuration {
  if (extensionSettingsProvider) {
    return extensionSettingsProvider();
  }
  return readLegacyVscodeConfiguration();
}

function readLegacyVscodeConfiguration(): Data7Configuration {
  const cfg = vscode.workspace.getConfiguration(SECTION);
  return migrateLegacyVscodeConfiguration({
    executorPath: cfg.get<string>("executorPath") ?? DEFAULT_EXTENSION_SETTINGS.executorPath,
    sharedModulesPath: cfg.get<string>("sharedModulesPath") ?? "",
    userName: cfg.get<string>("userName") ?? DEFAULT_EXTENSION_SETTINGS.userName,
    companyCode: cfg.get<number>("companyCode") ?? DEFAULT_EXTENSION_SETTINGS.companyCode,
    branchCode: cfg.get<number>("branchCode") ?? DEFAULT_EXTENSION_SETTINGS.branchCode,
    databaseConnectionId: cfg.get<string>("databaseConnectionId") ?? "",
    exclude: cfg.get<string[]>("exclude") ?? DEFAULT_EXCLUDE,
    diagnosticSeverity:
      cfg.get<Record<string, DiagnosticSeverityOverride>>("diagnosticSeverity") ?? {},
    features: mergeFeatures(cfg.get<Partial<Data7Configuration["features"]>>("features")),
    sugars: normalizeExtensionSettings({
      sugars: cfg.get<Data7Configuration["sugars"]>("sugars"),
    }).sugars,
    autoFormatOnSave: cfg.get<boolean>("autoFormatOnSave") ?? false,
  });
}

function mergeFeatures(
  configured: Partial<Data7Configuration["features"]> | undefined,
): Data7Configuration["features"] {
  return {
    language: { ...DEFAULT_FEATURES.language, ...configured?.language },
    diagnostics: { ...DEFAULT_FEATURES.diagnostics, ...configured?.diagnostics },
    workspace: { ...DEFAULT_FEATURES.workspace, ...configured?.workspace },
    save: { ...DEFAULT_FEATURES.save, ...configured?.save },
    build: { ...DEFAULT_FEATURES.build, ...configured?.build },
    preview: { ...DEFAULT_FEATURES.preview, ...configured?.preview },
  };
}

export function resolveDiagnosticSeverity(
  code: string,
  defaultSeverity: vscode.DiagnosticSeverity,
  overrides: Readonly<Record<string, DiagnosticSeverityOverride>> = readConfiguration()
    .diagnosticSeverity,
): vscode.DiagnosticSeverity | undefined {
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

function cachedGlobToRegex(glob: string): RegExp {
  const cached = globRegexCache.get(glob);
  if (cached) return cached;
  const compiled = globToRegex(glob);
  globRegexCache.set(glob, compiled);
  return compiled;
}

export function __resetGlobCacheForTests(): void {
  globRegexCache.clear();
}

function globToRegex(glob: string): RegExp {
  let regex = "^";
  for (let i = 0; i < glob.length; i++) {
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

export function isReadOnlyModuleFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return /(^|\/)data7_modules\//.test(normalized);
}

export function findLegacyDataModulesExcludePattern(
  patterns: readonly string[] = readConfiguration().exclude,
): string | undefined {
  const probe = "/workspace/data7_modules/mod_x.bas";
  return patterns.find((pattern) => cachedGlobToRegex(pattern).test(probe));
}

export function onConfigurationChanged(
  listener: (config: Data7Configuration) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION) || extensionSettingsProvider) {
      listener(readConfiguration());
    }
  });
}

export function loadDotEnv(dir: string): void {
  const envPath = path.join(dir, ".env");
  if (!fs.existsSync(envPath)) return;
  try {
    const content = fs.readFileSync(envPath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    // ignore
  }
}
