import { generateProjectGuid } from "../utils/guid";
import { DEFAULT_BUILD_OPTIMIZATION_OPTIONS } from "./optimizer/optimization-options";
import type { ProjectBuildOptimization, ProjectMetadata, ProjectOptions } from "./project-metadata";

export interface CreateDefaultProjectMetadataInput {
  readonly nome: string;
  readonly language?: string;
  readonly version?: string;
  readonly targetPlatform?: string;
  readonly opcoes: ProjectOptions;
  readonly dependencies?: Record<string, string>;
  readonly moduleCount?: number;
}

/** Canonical `build.optimization` block written to new and decompiled projects. */
export function createDefaultProjectBuildOptimization(): ProjectBuildOptimization {
  return {
    sourceMap: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.sourceMap,
    minify: {
      enabled: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.enabled,
      stripComments: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.stripComments,
      collapseWhitespace: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.collapseWhitespace,
    },
    prune: {
      enabled: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.enabled,
      report: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.report,
      strategy: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.strategy,
      alwaysInclude: [...DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.alwaysInclude],
      remove: { ...DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.remove },
    },
    uglify: {
      enabled: DEFAULT_BUILD_OPTIMIZATION_OPTIONS.uglify.enabled,
    },
  };
}

/** Builds a complete `data7.json` manifest with all supported build options. */
export function createDefaultProjectMetadata(
  input: CreateDefaultProjectMetadataInput,
): ProjectMetadata {
  const moduleCount = input.moduleCount ?? 1;
  return {
    nome: input.nome,
    language: input.language ?? "Basic",
    version: input.version ?? input.opcoes.versao,
    targetPlatform: input.targetPlatform ?? "Default",
    opcoes: input.opcoes,
    build: {
      optimization: createDefaultProjectBuildOptimization(),
    },
    virtualFolders: [
      {
        nome: `Unidades (${moduleCount})`,
        id: generateProjectGuid(),
        pastaId: "",
        aberta: "Sim",
      },
    ],
    modulesMetadata: {},
    dependencies: input.dependencies ?? {},
  };
}
