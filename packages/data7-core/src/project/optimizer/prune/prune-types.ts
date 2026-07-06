export interface PruneModuleInput {
  readonly moduleName: string;
  readonly fileUri: string;
  readonly code: string;
}

export interface PruneReport {
  readonly strategy: "principal-closure";
  readonly liveNamespaces: readonly string[];
  readonly excludedNamespaces: readonly string[];
  readonly excludedModules: readonly string[];
  readonly warnings: readonly string[];
}

export interface PruneResult {
  readonly modules: ReadonlyMap<string, string>;
  readonly excludedModuleNames: ReadonlySet<string>;
  readonly report?: PruneReport;
}
