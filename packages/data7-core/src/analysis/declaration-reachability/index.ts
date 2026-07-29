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
  readonly skippedDueToParseErrors: boolean;
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

  if (parsed.some((module) => module.parse.errors.length > 0)) {
    return {
      live: { declarations: new Set(), namespaces: new Set() },
      index: buildReachabilityIndex([]),
      parsed,
      skippedDueToParseErrors: true,
    };
  }

  const index = buildReachabilityIndex(parsed);
  const live = computeLiveSet(index, options);
  return { live, index, parsed, skippedDueToParseErrors: false };
}
