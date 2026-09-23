export {
  declarationKey,
  formatDeclarationLabel,
  isClassLifecycleMethod,
  DEFAULT_REACHABILITY_REMOVE_OPTIONS,
  type DeclarationKind,
  type ReachabilityModuleInput,
  type ReachabilityOptions,
  type ReachabilityRemoveOptions,
} from "./types";
export { shouldRemoveKind, retainsUnreachableMembers } from "./remove-options";
export {
  KEEP_DIRECTIVE_PATTERN,
  buildReachabilityIndex,
  findClassLike,
  findDeclarationsByName,
  findMembersInClass,
  hasKeepDirective,
  type DeclarationRecord,
  type ParsedReachabilityModule,
  type ReachabilityIndex,
} from "./index-builder";
export { computeLiveSet, type LiveSet } from "./reachability";
export { ReachabilityParseCache } from "./parse-cache";
export {
  ReachabilityResultCache,
  fingerprintReachabilityInputs,
} from "./reachability-result-cache";

import { ReachabilityParseCache } from "./parse-cache";
import { buildReachabilityIndex, type ParsedReachabilityModule } from "./index-builder";
import { computeLiveSet, type LiveSet } from "./reachability";
import type { ReachabilityModuleInput, ReachabilityOptions } from "./types";
import type { ReachabilityIndex } from "./index-builder";
import { LintPipelineProfiler } from "../lint-pipeline-profiler";
import { recordPerf } from "../../utils/performance";
import { performance } from "node:perf_hooks";
import {
  fingerprintReachabilityInputs,
  ReachabilityResultCache,
} from "./reachability-result-cache";

export interface DeclarationReachabilityResult {
  readonly live: LiveSet;
  readonly index: ReachabilityIndex;
  readonly parsed: readonly ParsedReachabilityModule[];
  /** True when analysis aborted (e.g. Principal failed to parse, or strict mode with any error). */
  readonly skippedDueToParseErrors: boolean;
  /** Modules omitted from the graph because they failed to parse (partial mode only). */
  readonly unparsedModuleNames: readonly string[];
}

/**
 * Shared declaration reachability used by the linter (`unused-code`)
 * and by build prune.
 */
export function analyzeDeclarationReachability(
  modules: readonly ReachabilityModuleInput[],
  options: ReachabilityOptions,
): DeclarationReachabilityResult {
  // Parses are memoized per file: this runs over the whole project on a
  // debounce while the user types, and re-parsing every module each pass was
  // the dominant cost in the extension host.
  const timed = LintPipelineProfiler.isEnabled();
  const resultCache = ReachabilityResultCache.getInstance();
  const fingerprint = fingerprintReachabilityInputs(modules, options);
  const cached = resultCache.get(fingerprint);
  if (cached) {
    if (timed) recordPerf("reachability.cache-hit", 0);
    return cached;
  }

  const parseCache = ReachabilityParseCache.getInstance();
  const t0Parse = timed ? performance.now() : 0;
  const parsed: ParsedReachabilityModule[] = modules.map((input) => ({
    input,
    parse: parseCache.getOrParse(input.fileUri, input.code),
  }));
  if (timed) recordPerf("reachability.parse", performance.now() - t0Parse);

  const failed = parsed.filter((module) => module.parse.errors.length > 0);
  const ok = parsed.filter((module) => module.parse.errors.length === 0);
  const unparsedModuleNames = failed.map((module) => module.input.moduleName);
  const principalFailed = failed.some(
    (module) => module.input.moduleName.toLowerCase() === "principal",
  );

  const empty = (): DeclarationReachabilityResult => ({
    live: { declarations: new Set(), namespaces: new Set() },
    index: buildReachabilityIndex([]),
    parsed,
    skippedDueToParseErrors: true,
    unparsedModuleNames,
  });

  if (failed.length > 0) {
    if (!options.allowPartialParse || principalFailed || ok.length === 0) {
      const aborted = empty();
      resultCache.set(fingerprint, aborted);
      return aborted;
    }
  }

  const t0Index = timed ? performance.now() : 0;
  const index = buildReachabilityIndex(ok);
  if (timed) recordPerf("reachability.index", performance.now() - t0Index);
  const t0Live = timed ? performance.now() : 0;
  const live = computeLiveSet(index, options);
  if (timed) recordPerf("reachability.live", performance.now() - t0Live);
  const result: DeclarationReachabilityResult = {
    live,
    index,
    parsed,
    skippedDueToParseErrors: false,
    unparsedModuleNames,
  };
  resultCache.set(fingerprint, result);
  return result;
}
