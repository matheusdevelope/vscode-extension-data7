export type DiagnosticSeverityOverride = "error" | "warning" | "info" | "hint" | "off";

export interface Data7Configuration {
  readonly executorPath: string;
  readonly sharedModulesPath: string;
  readonly userName: string;
  readonly companyCode: number;
  readonly branchCode: number;
  readonly databaseConnectionId: string;
  readonly exclude: readonly string[];
  readonly diagnosticSeverity: Readonly<Record<string, DiagnosticSeverityOverride>>;
  readonly features: {
    readonly language: {
      readonly generics: boolean;
      readonly sugars: boolean;
    };
    readonly diagnostics: {
      readonly enabled: boolean;
      readonly lintWorkspaceOnStartup: boolean;
      /**
       * When true, diagnostics (and later language features) run in the
       * `@data7/lsp` process. Default false until the server stabilizes
       * (LSP-001 / REFACTOR-ANALYSIS-ENGINE.md § Fase 7).
       */
      readonly useLanguageServer: boolean;
    };
    readonly workspace: {
      readonly detectProjectFiles: boolean;
      readonly installMcpServerOnStartup: boolean;
    };
    readonly save: {
      readonly autoFixOnSave: boolean;
      readonly autoFormatOnSave: boolean;
    };
    readonly build: {
      readonly autoFixBeforeBuild: boolean;
    };
    readonly preview: {
      readonly enabled: boolean;
    };
  };
  readonly sugars: {
    readonly enabled: boolean;
    readonly enabledIds: readonly string[];
    readonly disabledIds: readonly string[];
  };
}

export const DEFAULT_EXCLUDE: readonly string[] = ["**/node_modules/**", "**/.git/**", "**/out/**"];

export const DEFAULT_FEATURES: Data7Configuration["features"] = {
  language: { generics: true, sugars: true },
  diagnostics: { enabled: true, lintWorkspaceOnStartup: false, useLanguageServer: false },
  workspace: {
    detectProjectFiles: true,
    installMcpServerOnStartup: true,
  },
  save: { autoFixOnSave: true, autoFormatOnSave: false },
  build: { autoFixBeforeBuild: false },
  preview: { enabled: true },
};
