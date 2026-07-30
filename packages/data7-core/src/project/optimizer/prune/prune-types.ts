export type { DeclarationKind as PruneDeclKind } from "../../../analysis/declaration-reachability";
export { declarationKey, formatDeclarationLabel } from "../../../analysis/declaration-reachability";

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
  readonly excludedDeclarations: readonly string[];
  readonly warnings: readonly string[];
}

export interface PruneResult {
  readonly modules: ReadonlyMap<string, string>;
  readonly excludedModuleNames: ReadonlySet<string>;
  /**
   * When present: pruned generated line → input (pre-prune) line, per module.
   * Omitted for modules kept verbatim (parse skip) or when prune is disabled.
   */
  readonly lineMaps?: ReadonlyMap<string, number[]>;
  readonly report?: PruneReport;
}
