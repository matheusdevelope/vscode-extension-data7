import type { ParserPlugin } from "../parser";

export interface SugarUtilityModule {
  readonly id: string;
  readonly namespace: string;
  readonly dependencies?: readonly string[];
  generateCode(): string;
}

export interface SugarPlugin {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly enabledByDefault: boolean;
  readonly priority?: number;
  readonly dependencies?: readonly string[];
  readonly syntaxKinds?: readonly string[];
  readonly diagnosticCodes?: readonly string[];
  createParserPlugin?(): ParserPlugin;
  utilityModules?(): readonly SugarUtilityModule[];
}

export interface SugarEngineOptions {
  readonly enabled?: boolean;
  readonly enabledSugarIds?: readonly string[];
  readonly disabledSugarIds?: readonly string[];
}

export interface SugarCatalogEntry {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly enabledByDefault: boolean;
  readonly priority: number;
  readonly dependencies: readonly string[];
  readonly syntaxKinds: readonly string[];
  readonly diagnosticCodes: readonly string[];
  readonly utilityModules: readonly string[];
}
