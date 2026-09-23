import { hashContent } from "../../utils/content-hash";
import type { LiveSet } from "./reachability";
import type { ParsedReachabilityModule, ReachabilityIndex } from "./index-builder";
import type { ReachabilityModuleInput, ReachabilityOptions } from "./types";

const MAX_ENTRIES = 8;

interface CachedReachabilityResult {
  readonly live: LiveSet;
  readonly index: ReachabilityIndex;
  readonly parsed: readonly ParsedReachabilityModule[];
  readonly skippedDueToParseErrors: boolean;
  readonly unparsedModuleNames: readonly string[];
}

interface CacheEntry {
  readonly fingerprint: string;
  readonly result: CachedReachabilityResult;
}

/**
 * Memoizes a full declaration-reachability result (index + live set) keyed by
 * module identity/content plus prune options.
 *
 * Parse cache alone does not help hot build: `computeLiveSet` and
 * `buildReachabilityIndex` dominated wall time. The builder runs this twice
 * per compile (pre-transpile generic discovery, post-transpile prune) and
 * again on the next compile when sources are unchanged.
 */
export class ReachabilityResultCache {
  private static instance: ReachabilityResultCache | undefined;
  private readonly entries: CacheEntry[] = [];

  public static getInstance(): ReachabilityResultCache {
    ReachabilityResultCache.instance ??= new ReachabilityResultCache();
    return ReachabilityResultCache.instance;
  }

  public static resetForTests(): void {
    ReachabilityResultCache.instance?.clear();
    ReachabilityResultCache.instance = undefined;
  }

  public get(fingerprint: string): CachedReachabilityResult | undefined {
    const hit = this.entries.find((entry) => entry.fingerprint === fingerprint);
    return hit?.result;
  }

  public set(fingerprint: string, result: CachedReachabilityResult): void {
    const existing = this.entries.findIndex((entry) => entry.fingerprint === fingerprint);
    if (existing >= 0) {
      this.entries.splice(existing, 1);
    }
    this.entries.push({ fingerprint, result });
    while (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  public clear(): void {
    this.entries.length = 0;
  }

  public get size(): number {
    return this.entries.length;
  }
}

export function fingerprintReachabilityInputs(
  modules: readonly ReachabilityModuleInput[],
  options: ReachabilityOptions,
): string {
  const moduleParts = modules.map(
    (module) =>
      `${module.moduleName.toLowerCase()}\0${module.fileUri.toLowerCase()}\0${hashContent(module.code)}`,
  );
  moduleParts.sort();
  const remove = options.remove;
  const optionsPart = JSON.stringify({
    alwaysInclude: [...options.alwaysInclude].map((item) => item.toLowerCase()).sort(),
    allowPartialParse: options.allowPartialParse === true,
    remove: {
      namespaces: remove.namespaces,
      classes: remove.classes,
      structures: remove.structures,
      enums: remove.enums,
      delegates: remove.delegates,
      methods: remove.methods,
      declareMethods: remove.declareMethods,
      fields: remove.fields,
      properties: remove.properties,
      consts: remove.consts,
      variables: remove.variables,
      unusedImports: remove.unusedImports,
    },
  });
  return hashContent(`${moduleParts.join("\n")}\n${optionsPart}`);
}
