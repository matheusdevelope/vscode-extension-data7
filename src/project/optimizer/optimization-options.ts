import type { ProjectMetadata } from "../project-metadata";
import { isRecord } from "../project-config";

export interface MinifyOptimizationOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
  readonly removeUnused: boolean;
  readonly mergeNamespaces: boolean;
}

export interface UglifyOptimizationOptions {
  readonly enabled: boolean;
}

export interface BuildOptimizationOptions {
  readonly sourceMap: boolean;
  readonly minify: MinifyOptimizationOptions;
  readonly uglify: UglifyOptimizationOptions;
}

export const DEFAULT_BUILD_OPTIMIZATION_OPTIONS: BuildOptimizationOptions = Object.freeze({
  sourceMap: true,
  minify: Object.freeze({
    enabled: false,
    stripComments: true,
    removeUnused: false,
    mergeNamespaces: false,
  }),
  uglify: Object.freeze({
    enabled: false,
  }),
});

export type BuildOptimizationOverride = Partial<{
  readonly sourceMap: boolean;
  readonly minify: Partial<MinifyOptimizationOptions>;
  readonly uglify: Partial<UglifyOptimizationOptions>;
}>;

export function resolveBuildOptimizationOptions(
  metadata: ProjectMetadata,
  override?: BuildOptimizationOverride,
): BuildOptimizationOptions {
  const buildRaw = isRecord(metadata.build) ? metadata.build : {};
  const optimizationRaw = isRecord(buildRaw.optimization) ? buildRaw.optimization : {};
  const minifyRaw = isRecord(optimizationRaw.minify) ? optimizationRaw.minify : {};
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
      removeUnused:
        typeof minifyRaw.removeUnused === "boolean"
          ? minifyRaw.removeUnused
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.removeUnused,
      mergeNamespaces:
        typeof minifyRaw.mergeNamespaces === "boolean"
          ? minifyRaw.mergeNamespaces
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.mergeNamespaces,
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
      removeUnused: override.minify?.removeUnused ?? base.minify.removeUnused,
      mergeNamespaces: override.minify?.mergeNamespaces ?? base.minify.mergeNamespaces,
    },
    uglify: {
      enabled: override.uglify?.enabled ?? base.uglify.enabled,
    },
  };
}
