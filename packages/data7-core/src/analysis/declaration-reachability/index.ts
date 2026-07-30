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

import { parseBasic } from "../../project/parser";
import { buildReachabilityIndex, type ParsedReachabilityModule } from "./index-builder";
import { computeLiveSet, type LiveSet } from "./reachability";
import type { ReachabilityModuleInput, ReachabilityOptions } from "./types";
import type { ReachabilityIndex } from "./index-builder";

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
  const parsed: ParsedReachabilityModule[] = modules.map((input) => ({
    input,
    parse: parseBasic(input.code),
  }));

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
      return empty();
    }
  }

  const index = buildReachabilityIndex(ok);
  const live = computeLiveSet(index, options);
  return {
    live,
    index,
    parsed,
    skippedDueToParseErrors: false,
    unparsedModuleNames,
  };
}
