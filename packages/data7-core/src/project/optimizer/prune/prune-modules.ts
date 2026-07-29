import { serializeUnit, BUILD_SERIALIZE_OPTIONS } from "../../parser";
import type { PruneOptimizationOptions } from "../optimization-options";
import {
  analyzeDeclarationReachability,
  formatDeclarationLabel,
  type ReachabilityModuleInput,
} from "../../../analysis/declaration-reachability";
import {
  hasNamespaceDeclarations,
  rewriteCompilationUnit,
  shouldExcludeEntireModule,
} from "./prune-rewrite";
import type { PruneModuleInput, PruneReport, PruneResult } from "./prune-types";

export function pruneBuildModules(
  modules: readonly PruneModuleInput[],
  options: PruneOptimizationOptions,
): PruneResult {
  if (!options.enabled) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
      excludedModuleNames: new Set(),
    };
  }

  const inputs: ReachabilityModuleInput[] = modules.map((module) => ({
    moduleName: module.moduleName,
    fileUri: module.fileUri,
    code: module.code,
  }));

  const analysis = analyzeDeclarationReachability(inputs, {
    alwaysInclude: options.alwaysInclude,
    remove: options.remove,
  });

  if (analysis.skippedDueToParseErrors) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
      excludedModuleNames: new Set(),
      report: {
        strategy: "principal-closure",
        liveNamespaces: [],
        excludedNamespaces: [],
        excludedModules: [],
        excludedDeclarations: [],
        warnings: ["Prune skipped because at least one module failed to parse."],
      },
    };
  }

  const { live, index, parsed } = analysis;
  const optimized = new Map<string, string>();
  const excludedModuleNames = new Set<string>();
  const excludedNamespaces: string[] = [];
  const excludedDeclarations: string[] = [];

  for (const decl of index.declarations) {
    if (decl.kind !== "namespace") continue;
    if (!live.namespaces.has(decl.lower) && options.remove.namespaces) {
      excludedNamespaces.push(decl.name);
    }
  }

  for (const module of parsed) {
    if (shouldExcludeEntireModule(module, live, options.remove, index)) {
      excludedModuleNames.add(module.input.moduleName);
      for (const decl of index.declarations) {
        if (decl.module !== module || decl.kind !== "namespace") continue;
        excludedDeclarations.push(
          formatDeclarationLabel(decl.name, undefined, "namespace", decl.name),
        );
      }
      continue;
    }

    const rewritten = rewriteCompilationUnit(
      module.parse.unit,
      module,
      index,
      live,
      options.remove,
    );
    excludedDeclarations.push(...rewritten.excludedDeclarations);

    if (!hasNamespaceDeclarations(rewritten.unit.members)) {
      if (module.input.moduleName.toLowerCase() === "principal") {
        optimized.set(
          module.input.moduleName,
          serializeUnit(rewritten.unit, {
            eol: module.input.code.includes("\r\n") ? "\r\n" : "\n",
            ...BUILD_SERIALIZE_OPTIONS,
          }),
        );
        continue;
      }
      excludedModuleNames.add(module.input.moduleName);
      continue;
    }

    optimized.set(
      module.input.moduleName,
      serializeUnit(rewritten.unit, {
        eol: module.input.code.includes("\r\n") ? "\r\n" : "\n",
        ...BUILD_SERIALIZE_OPTIONS,
      }),
    );
  }

  const report: PruneReport | undefined = options.report
    ? {
        strategy: "principal-closure",
        liveNamespaces: [...live.namespaces].map(
          (lower) => index.namespaceByLower.get(lower)?.name ?? lower,
        ),
        excludedNamespaces,
        excludedModules: [...excludedModuleNames],
        excludedDeclarations,
        warnings: [],
      }
    : undefined;

  return { modules: optimized, excludedModuleNames, report };
}
