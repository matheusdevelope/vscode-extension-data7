export type DeclarationKind =
  | "namespace"
  | "class"
  | "structure"
  | "enum"
  | "delegate"
  | "method"
  | "declareMethod"
  | "field"
  | "property"
  | "const"
  | "variable";

export interface ReachabilityModuleInput {
  readonly moduleName: string;
  readonly fileUri: string;
  readonly code: string;
}

/** Stable declaration key: module\0namespace\0ownerClass\0kind\0name (lowercased). */
export function declarationKey(
  moduleName: string,
  namespace: string,
  ownerClass: string | undefined,
  kind: DeclarationKind,
  name: string,
): string {
  return `${moduleName}\0${namespace}\0${ownerClass ?? ""}\0${kind}\0${name}`.toLowerCase();
}

export function formatDeclarationLabel(
  namespace: string,
  ownerClass: string | undefined,
  kind: DeclarationKind,
  name: string,
): string {
  const owner = ownerClass ? `${ownerClass}.` : "";
  const ns = namespace ? `${namespace}.` : "";
  return `${kind}:${ns}${owner}${name}`;
}

/**
 * Data7 lifecycle methods that ride with a live class/structure even when
 * never referenced explicitly (`New T()` seeds constructors; `Free` is the
 * mandatory disposer and must not be pruned or flagged as unreachable).
 */
export function isClassLifecycleMethod(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "new" || lower === "free";
}

export interface ReachabilityRemoveOptions {
  readonly namespaces: boolean;
  readonly classes: boolean;
  readonly structures: boolean;
  readonly enums: boolean;
  readonly delegates: boolean;
  readonly methods: boolean;
  readonly declareMethods: boolean;
  readonly fields: boolean;
  readonly properties: boolean;
  readonly consts: boolean;
  readonly variables: boolean;
  readonly unusedImports: boolean;
}

export const DEFAULT_REACHABILITY_REMOVE_OPTIONS: ReachabilityRemoveOptions = Object.freeze({
  namespaces: true,
  classes: true,
  structures: true,
  enums: true,
  delegates: true,
  methods: true,
  declareMethods: true,
  fields: true,
  properties: true,
  consts: true,
  variables: true,
  unusedImports: true,
});

export interface ReachabilityOptions {
  readonly alwaysInclude: readonly string[];
  readonly remove: ReachabilityRemoveOptions;
  /**
   * When true, modules with parse errors are omitted from the graph and callers
   * may keep their original source. Principal parse failure still aborts analysis.
   */
  readonly allowPartialParse?: boolean;
}
