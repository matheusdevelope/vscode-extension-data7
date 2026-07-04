import type { CompilationUnit } from "../project/ast/ast";
import type { SymbolInfo } from "./symbol-indexer";

const fileLocalsCacheHolder: { map: WeakMap<object, Map<number, Map<string, string>>> } = {
  map: new WeakMap(),
};
const expressionTypeCacheHolder: { map: WeakMap<object, string | undefined> } = {
  map: new WeakMap(),
};
const rawExpressionTypeCacheHolder: { map: WeakMap<object, string | undefined> } = {
  map: new WeakMap(),
};
const genericParamsCacheHolder: { map: WeakMap<object, Map<string, Map<string, string>>> } = {
  map: new WeakMap(),
};
const localScopeIndexCacheHolder: { map: WeakMap<object, unknown> } = { map: new WeakMap() };
const fileLineContextCacheHolder: { map: WeakMap<object, unknown> } = { map: new WeakMap() };
const identifierTypeByLineCacheHolder: { map: WeakMap<object, Map<string, string | undefined>> } = {
  map: new WeakMap(),
};
const memberAccessTypeCacheHolder: { map: WeakMap<object, Map<string, string | undefined>> } = {
  map: new WeakMap(),
};
const methodInvocationReturnCacheHolder: { map: WeakMap<object, Map<string, string | undefined>> } =
  {
    map: new WeakMap(),
  };
const unqualifiedCallableCacheHolder: {
  map: WeakMap<object, Map<string, SymbolInfo | undefined>>;
} = {
  map: new WeakMap(),
};

export function getFileLocalsCache(): WeakMap<object, Map<number, Map<string, string>>> {
  return fileLocalsCacheHolder.map;
}

export function getExpressionTypeCache(): WeakMap<object, string | undefined> {
  return expressionTypeCacheHolder.map;
}

export function getRawExpressionTypeCache(): WeakMap<object, string | undefined> {
  return rawExpressionTypeCacheHolder.map;
}

export function getGenericParamsCache(): WeakMap<object, Map<string, Map<string, string>>> {
  return genericParamsCacheHolder.map;
}

export function getLocalScopeIndexCacheHolder(): { map: WeakMap<object, unknown> } {
  return localScopeIndexCacheHolder;
}

export function getFileLineContextCacheHolder(): { map: WeakMap<object, unknown> } {
  return fileLineContextCacheHolder;
}

export function getIdentifierTypeByLineCacheHolder(): {
  map: WeakMap<object, Map<string, string | undefined>>;
} {
  return identifierTypeByLineCacheHolder;
}

export function memberAccessCacheKey(
  lineIdx: number,
  targetType: string | undefined,
  memberName: string,
): string {
  return `${lineIdx}\0${(targetType ?? "?").toLowerCase()}\0${memberName.toLowerCase()}`;
}

export function methodInvocationReturnCacheKey(
  lineIdx: number,
  receiverType: string | undefined,
  methodName: string,
  arity: number,
  callSiteChar?: number,
): string {
  const sitePart = callSiteChar !== undefined ? `\0@${callSiteChar}` : "";
  return `${lineIdx}\0${(receiverType ?? "?").toLowerCase()}\0${methodName.toLowerCase()}\0${arity}${sitePart}`;
}

export function unqualifiedCallableCacheKey(
  lineIdx: number,
  methodName: string,
  arity: number | undefined,
  argumentTypes?: readonly (string | undefined)[],
  callSiteChar?: number,
): string {
  const typesPart =
    argumentTypes && argumentTypes.length > 0
      ? `\0${argumentTypes.map((type) => (type ?? "?").toLowerCase()).join(",")}`
      : "";
  const sitePart = callSiteChar !== undefined ? `\0@${callSiteChar}` : "";
  return `${lineIdx}\0${methodName.toLowerCase()}\0${arity ?? "any"}${typesPart}${sitePart}`;
}

export function getMemberAccessType(
  unit: CompilationUnit,
  cacheKey: string,
): string | undefined | null {
  const map = memberAccessTypeCacheHolder.map.get(unit);
  if (!map) return null;
  if (!map.has(cacheKey)) return null;
  return map.get(cacheKey);
}

export function setMemberAccessType(
  unit: CompilationUnit,
  cacheKey: string,
  type: string | undefined,
): void {
  let map = memberAccessTypeCacheHolder.map.get(unit);
  if (!map) {
    map = new Map();
    memberAccessTypeCacheHolder.map.set(unit, map);
  }
  map.set(cacheKey, type);
}

export function getMethodInvocationReturnType(
  unit: CompilationUnit,
  cacheKey: string,
): string | undefined | null {
  const map = methodInvocationReturnCacheHolder.map.get(unit);
  if (!map) return null;
  if (!map.has(cacheKey)) return null;
  return map.get(cacheKey);
}

export function setMethodInvocationReturnType(
  unit: CompilationUnit,
  cacheKey: string,
  type: string | undefined,
): void {
  let map = methodInvocationReturnCacheHolder.map.get(unit);
  if (!map) {
    map = new Map();
    methodInvocationReturnCacheHolder.map.set(unit, map);
  }
  map.set(cacheKey, type);
}

export function getUnqualifiedCallable(
  unit: CompilationUnit,
  cacheKey: string,
): SymbolInfo | undefined | null {
  const map = unqualifiedCallableCacheHolder.map.get(unit);
  if (!map) return null;
  if (!map.has(cacheKey)) return null;
  return map.get(cacheKey);
}

export function setUnqualifiedCallable(
  unit: CompilationUnit,
  cacheKey: string,
  symbol: SymbolInfo | undefined,
): void {
  let map = unqualifiedCallableCacheHolder.map.get(unit);
  if (!map) {
    map = new Map();
    unqualifiedCallableCacheHolder.map.set(unit, map);
  }
  map.set(cacheKey, symbol);
}

function clearUnitCaches(unit: CompilationUnit): void {
  memberAccessTypeCacheHolder.map.delete(unit);
  methodInvocationReturnCacheHolder.map.delete(unit);
  unqualifiedCallableCacheHolder.map.delete(unit);
  identifierTypeByLineCacheHolder.map.delete(unit);
  localScopeIndexCacheHolder.map.delete(unit);
  fileLineContextCacheHolder.map.delete(unit);
  genericParamsCacheHolder.map.delete(unit);
  fileLocalsCacheHolder.map.delete(unit);
  expressionTypeCacheHolder.map.delete(unit);
  rawExpressionTypeCacheHolder.map.delete(unit);
}

/** Drops all per-file type-resolution caches (e.g. config change, full reset). */
export function clearAllLintTypeResolutionCaches(): void {
  localScopeIndexCacheHolder.map = new WeakMap();
  fileLineContextCacheHolder.map = new WeakMap();
  identifierTypeByLineCacheHolder.map = new WeakMap();
  memberAccessTypeCacheHolder.map = new WeakMap();
  methodInvocationReturnCacheHolder.map = new WeakMap();
  unqualifiedCallableCacheHolder.map = new WeakMap();
  expressionTypeCacheHolder.map = new WeakMap();
  rawExpressionTypeCacheHolder.map = new WeakMap();
  genericParamsCacheHolder.map = new WeakMap();
  fileLocalsCacheHolder.map = new WeakMap();
}

/** Alias kept for callers that predate the consolidated cache module. */
export function clearLocalScopeIndexCache(): void {
  clearAllLintTypeResolutionCaches();
}

/** Invalidates caches tied to one parsed compilation unit. */
export function clearLintTypeResolutionCachesForUnit(unit: CompilationUnit): void {
  clearUnitCaches(unit);
}
