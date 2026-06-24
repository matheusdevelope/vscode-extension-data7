import type { EnumerableInfo } from "../analysis/enumerable-detector";
import type { ExternalGenericTemplate, RequestedGenericInstantiation } from "./generics";
import type { SugarEngineOptions } from "./sugars";

/** Diagnostics produced while lowering syntax sugars. */
export interface SugarDiagnostic {
  readonly code:
    | "not-enumerable"
    | "invalid-interpolation"
    | "ternary-context-unsupported"
    | "null-coalesce-context-unsupported"
    | "optional-chain-context-unsupported"
    | "optional-chain-too-deep"
    | "unknown-template"
    | "generic-arity-mismatch"
    | "duplicate-template"
    | "class-generic-method-unsupported"
    | "flat-name-collision"
    | "instantiation-limit-exceeded";
  readonly line: number;
  readonly column: number;
  readonly typeName: string;
}

/** Services supplied by the project layer to the transpilation pipeline. */
export interface TranspileContext {
  detectEnumerable(typeName: string, preferredElementType?: string): EnumerableInfo | undefined;
  isTypeDescendantOf?(typeName: string, baseTypeName: string): boolean | undefined;
  resolveTypeImport?(typeName: string): string | undefined;
  resolveGlobalSymbolType?(name: string, argumentCount: number): string | undefined;
  resolveMemberType?(typeName: string, name: string, argumentCount: number): string | undefined;
  externalGenericTemplates?: readonly ExternalGenericTemplate[];
  requestedGenericInstantiations?: readonly RequestedGenericInstantiation[];
  /** Enables generic monomorphization. Parsing remains enabled when false so
   * generic source is serialized losslessly instead of being partially read. */
  genericsEnabled?: boolean;
  sugarOptions?: SugarEngineOptions;
  rewritePrintToLogger?: boolean;
}

export interface TranspileResult {
  readonly code: string;
  readonly diagnostics: readonly SugarDiagnostic[];
  readonly lineMap?: number[];
  readonly usedSugars?: Set<string>;
}
