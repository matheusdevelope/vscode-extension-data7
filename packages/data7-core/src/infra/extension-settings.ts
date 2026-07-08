import type { Data7Configuration, DiagnosticSeverityOverride } from "./configuration-types";

export const EXTENSION_SETTINGS_FILENAME = "extension-settings.json" as const;
export const EXTENSION_SETTINGS_SCHEMA_VERSION = 1 as const;

export interface ExtensionSettingsFile {
  readonly schemaVersion: number;
  readonly settings: Data7Configuration;
}

export const DEFAULT_EXTENSION_SETTINGS: Data7Configuration = {
  executorPath: "C:\\Data7\\bin\\Executor.exe",
  sharedModulesPath: "",
  userName: "Administrador",
  companyCode: 1,
  branchCode: 1,
  databaseConnectionId: "",
  exclude: ["**/node_modules/**", "**/.git/**", "**/out/**"],
  diagnosticSeverity: {},
  features: {
    language: { generics: true, sugars: true },
    diagnostics: { enabled: true, lintWorkspaceOnStartup: false },
    workspace: { detectProjectFiles: true, installMcpServerOnStartup: true },
    save: { autoFixOnSave: true, autoFormatOnSave: false },
    build: { autoFixBeforeBuild: false },
    preview: { enabled: true },
  },
  sugars: {
    enabled: true,
    enabledIds: [],
    disabledIds: [],
  },
};

export function createExtensionSettingsFile(
  settings: Data7Configuration = DEFAULT_EXTENSION_SETTINGS,
): ExtensionSettingsFile {
  return {
    schemaVersion: EXTENSION_SETTINGS_SCHEMA_VERSION,
    settings: normalizeExtensionSettings(settings),
  };
}

export function parseExtensionSettingsFile(raw: unknown): ExtensionSettingsFile {
  if (!isRecord(raw)) {
    return createExtensionSettingsFile();
  }

  const schemaVersion =
    typeof raw.schemaVersion === "number" ? raw.schemaVersion : EXTENSION_SETTINGS_SCHEMA_VERSION;
  const settings = normalizeExtensionSettings(
    isRecord(raw.settings) ? (raw.settings as Partial<Data7Configuration>) : raw,
  );
  return { schemaVersion, settings };
}

export function normalizeExtensionSettings(
  partial: Partial<Data7Configuration> | undefined,
): Data7Configuration {
  const base = DEFAULT_EXTENSION_SETTINGS;
  const features = partial?.features;
  const sugars = partial?.sugars;

  return {
    executorPath: asString(partial?.executorPath, base.executorPath),
    sharedModulesPath: asString(partial?.sharedModulesPath, base.sharedModulesPath),
    userName: asString(partial?.userName, base.userName),
    companyCode: asNumber(partial?.companyCode, base.companyCode),
    branchCode: asNumber(partial?.branchCode, base.branchCode),
    databaseConnectionId: asString(partial?.databaseConnectionId, base.databaseConnectionId),
    exclude: asStringArray(partial?.exclude, base.exclude),
    diagnosticSeverity: asDiagnosticSeverityMap(
      partial?.diagnosticSeverity,
      base.diagnosticSeverity,
    ),
    features: {
      language: {
        generics: asBoolean(features?.language?.generics, base.features.language.generics),
        sugars: asBoolean(features?.language?.sugars, base.features.language.sugars),
      },
      diagnostics: {
        enabled: asBoolean(features?.diagnostics?.enabled, base.features.diagnostics.enabled),
        lintWorkspaceOnStartup: asBoolean(
          features?.diagnostics?.lintWorkspaceOnStartup,
          base.features.diagnostics.lintWorkspaceOnStartup,
        ),
      },
      workspace: {
        detectProjectFiles: asBoolean(
          features?.workspace?.detectProjectFiles,
          base.features.workspace.detectProjectFiles,
        ),
        installMcpServerOnStartup: asBoolean(
          features?.workspace?.installMcpServerOnStartup,
          base.features.workspace.installMcpServerOnStartup,
        ),
      },
      save: {
        autoFixOnSave: asBoolean(features?.save?.autoFixOnSave, base.features.save.autoFixOnSave),
        autoFormatOnSave: asBoolean(
          features?.save?.autoFormatOnSave,
          base.features.save.autoFormatOnSave,
        ),
      },
      build: {
        autoFixBeforeBuild: asBoolean(
          features?.build?.autoFixBeforeBuild,
          base.features.build.autoFixBeforeBuild,
        ),
      },
      preview: {
        enabled: asBoolean(features?.preview?.enabled, base.features.preview.enabled),
      },
    },
    sugars: {
      enabled: asBoolean(sugars?.enabled, base.sugars.enabled),
      enabledIds: asStringArray(sugars?.enabledIds, base.sugars.enabledIds),
      disabledIds: asStringArray(sugars?.disabledIds, base.sugars.disabledIds),
    },
  };
}

/** Maps legacy VS Code `data7.*` workspace configuration into the extension settings file. */
export function migrateLegacyVscodeConfiguration(
  legacy: Partial<Data7Configuration> & { autoFormatOnSave?: boolean },
): Data7Configuration {
  const normalized = normalizeExtensionSettings(legacy);
  if (legacy.autoFormatOnSave === true && normalized.features.save.autoFormatOnSave === false) {
    return {
      ...normalized,
      features: {
        ...normalized.features,
        save: {
          ...normalized.features.save,
          autoFormatOnSave: true,
        },
      },
    };
  }
  return normalized;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === "string");
}

function asDiagnosticSeverityMap(
  value: unknown,
  fallback: Readonly<Record<string, DiagnosticSeverityOverride>>,
): Record<string, DiagnosticSeverityOverride> {
  if (!isRecord(value)) return { ...fallback };
  const result: Record<string, DiagnosticSeverityOverride> = {};
  for (const [key, severity] of Object.entries(value)) {
    if (
      severity === "error" ||
      severity === "warning" ||
      severity === "info" ||
      severity === "hint" ||
      severity === "off"
    ) {
      result[key] = severity;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
