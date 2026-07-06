import type { ProjectMetadata } from "../project-metadata";
import { isRecord } from "../project-config";

export interface MinifyOptimizationOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
}

export interface PruneOptimizationOptions {
  readonly enabled: boolean;
  readonly report: boolean;
  readonly strategy: "principal-closure";
  readonly alwaysInclude: readonly string[];
}

export interface UglifyOptimizationOptions {
  readonly enabled: boolean;
}

export interface BuildOptimizationOptions {
  readonly sourceMap: boolean;
  readonly minify: MinifyOptimizationOptions;
  readonly prune: PruneOptimizationOptions;
  readonly uglify: UglifyOptimizationOptions;
}

export const DEFAULT_BUILD_OPTIMIZATION_OPTIONS: BuildOptimizationOptions = Object.freeze({
  sourceMap: true,
  minify: Object.freeze({
    enabled: false,
    stripComments: true,
  }),
  prune: Object.freeze({
    enabled: false,
    report: false,
    strategy: "principal-closure",
    alwaysInclude: Object.freeze([]),
  }),
  uglify: Object.freeze({
    enabled: false,
  }),
});

export type BuildOptimizationOverride = Partial<{
  readonly sourceMap: boolean;
  readonly minify: Partial<MinifyOptimizationOptions>;
  readonly prune: Partial<PruneOptimizationOptions>;
  readonly uglify: Partial<UglifyOptimizationOptions>;
}>;

export function resolveBuildOptimizationOptions(
  metadata: ProjectMetadata,
  override?: BuildOptimizationOverride,
): BuildOptimizationOptions {
  const buildRaw = isRecord(metadata.build) ? metadata.build : {};
  const optimizationRaw = isRecord(buildRaw.optimization) ? buildRaw.optimization : {};
  const minifyRaw = isRecord(optimizationRaw.minify) ? optimizationRaw.minify : {};
  const pruneRaw = isRecord(optimizationRaw.prune) ? optimizationRaw.prune : {};
  const uglifyRaw = isRecord(optimizationRaw.uglify) ? optimizationRaw.uglify : {};

  const legacyMinifyEnabled = metadata.opcoes.minify === true;
  const legacyStripComments = metadata.opcoes.stripComments;

  const configured: BuildOptimizationOptions = {
    sourceMap:
      typeof optimizationRaw.sourceMap === "boolean"
        ? optimizationRaw.sourceMap
        : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.sourceMap,
    minify: {
      enabled: typeof minifyRaw.enabled === "boolean" ? minifyRaw.enabled : legacyMinifyEnabled,
      stripComments:
        typeof minifyRaw.stripComments === "boolean"
          ? minifyRaw.stripComments
          : typeof legacyStripComments === "boolean"
            ? legacyStripComments
            : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.stripComments,
    },
    prune: {
      enabled:
        typeof pruneRaw.enabled === "boolean"
          ? pruneRaw.enabled
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.enabled,
      report:
        typeof pruneRaw.report === "boolean"
          ? pruneRaw.report
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.report,
      strategy: "principal-closure",
      alwaysInclude: Array.isArray(pruneRaw.alwaysInclude)
        ? pruneRaw.alwaysInclude.filter((item): item is string => typeof item === "string")
        : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.prune.alwaysInclude,
    },
    uglify: {
      enabled:
        typeof uglifyRaw.enabled === "boolean"
          ? uglifyRaw.enabled
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.uglify.enabled,
    },
  };

  return mergeBuildOptimizationOptions(configured, override);
}

function mergeBuildOptimizationOptions(
  base: BuildOptimizationOptions,
  override: BuildOptimizationOverride | undefined,
): BuildOptimizationOptions {
  if (!override) return base;
  return {
    sourceMap: override.sourceMap ?? base.sourceMap,
    minify: {
      enabled: override.minify?.enabled ?? base.minify.enabled,
      stripComments: override.minify?.stripComments ?? base.minify.stripComments,
    },
    prune: {
      enabled: override.prune?.enabled ?? base.prune.enabled,
      report: override.prune?.report ?? base.prune.report,
      strategy: "principal-closure",
      alwaysInclude: override.prune?.alwaysInclude ?? base.prune.alwaysInclude,
    },
    uglify: {
      enabled: override.uglify?.enabled ?? base.uglify.enabled,
    },
  };
}
