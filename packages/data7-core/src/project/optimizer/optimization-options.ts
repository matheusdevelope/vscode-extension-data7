import type { ProjectMetadata } from "../project-metadata";
import { isRecord } from "../project-config";

export interface MinifyOptimizationOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
  /** Compress whitespace outside strings. Default false — fragile on line continuations. */
  readonly collapseWhitespace: boolean;
}

export interface PruneRemoveOptions {
  readonly namespaces: boolean;
  readonly classes: boolean;
  readonly structures: boolean;
  readonly enums: boolean;
  readonly delegates: boolean;
  readonly methods: boolean;
  readonly declareMethods: boolean;
  readonly fields: boolean;
  readonly properties: boolean;
  readonly consts: boolean;
  readonly variables: boolean;
  readonly unusedImports: boolean;
}

export interface PruneOptimizationOptions {
  readonly enabled: boolean;
  readonly report: boolean;
  readonly strategy: "principal-closure";
  readonly alwaysInclude: readonly string[];
  readonly remove: PruneRemoveOptions;
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

export const DEFAULT_PRUNE_REMOVE_OPTIONS: PruneRemoveOptions = Object.freeze({
  namespaces: true,
  classes: true,
  structures: true,
  enums: true,
  delegates: true,
  methods: true,
  declareMethods: true,
  fields: true,
  properties: true,
  consts: true,
  variables: true,
  unusedImports: true,
});

export const DEFAULT_BUILD_OPTIMIZATION_OPTIONS: BuildOptimizationOptions = Object.freeze({
  sourceMap: true,
  minify: Object.freeze({
    enabled: false,
    stripComments: true,
    collapseWhitespace: false,
  }),
  prune: Object.freeze({
    enabled: false,
    report: false,
    strategy: "principal-closure",
    alwaysInclude: Object.freeze([]),
    remove: DEFAULT_PRUNE_REMOVE_OPTIONS,
  }),
  uglify: Object.freeze({
    enabled: false,
  }),
});

export type BuildOptimizationOverride = Partial<{
  readonly sourceMap: boolean;
  readonly minify: Partial<MinifyOptimizationOptions>;
  readonly prune: Partial<Omit<PruneOptimizationOptions, "remove">> & {
    readonly remove?: Partial<PruneRemoveOptions>;
  };
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
  const removeRaw = isRecord(pruneRaw.remove) ? pruneRaw.remove : {};
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
      collapseWhitespace:
        typeof minifyRaw.collapseWhitespace === "boolean"
          ? minifyRaw.collapseWhitespace
          : DEFAULT_BUILD_OPTIMIZATION_OPTIONS.minify.collapseWhitespace,
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
      remove: resolvePruneRemoveOptions(removeRaw),
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

function resolvePruneRemoveOptions(removeRaw: Record<string, unknown>): PruneRemoveOptions {
  const read = (key: keyof PruneRemoveOptions): boolean => {
    const value = removeRaw[key];
    return typeof value === "boolean" ? value : DEFAULT_PRUNE_REMOVE_OPTIONS[key];
  };
  return {
    namespaces: read("namespaces"),
    classes: read("classes"),
    structures: read("structures"),
    enums: read("enums"),
    delegates: read("delegates"),
    methods: read("methods"),
    declareMethods: read("declareMethods"),
    fields: read("fields"),
    properties: read("properties"),
    consts: read("consts"),
    variables: read("variables"),
    unusedImports: read("unusedImports"),
  };
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
      collapseWhitespace: override.minify?.collapseWhitespace ?? base.minify.collapseWhitespace,
    },
    prune: {
      enabled: override.prune?.enabled ?? base.prune.enabled,
      report: override.prune?.report ?? base.prune.report,
      strategy: "principal-closure",
      alwaysInclude: override.prune?.alwaysInclude ?? base.prune.alwaysInclude,
      remove: {
        namespaces: override.prune?.remove?.namespaces ?? base.prune.remove.namespaces,
        classes: override.prune?.remove?.classes ?? base.prune.remove.classes,
        structures: override.prune?.remove?.structures ?? base.prune.remove.structures,
        enums: override.prune?.remove?.enums ?? base.prune.remove.enums,
        delegates: override.prune?.remove?.delegates ?? base.prune.remove.delegates,
        methods: override.prune?.remove?.methods ?? base.prune.remove.methods,
        declareMethods: override.prune?.remove?.declareMethods ?? base.prune.remove.declareMethods,
        fields: override.prune?.remove?.fields ?? base.prune.remove.fields,
        properties: override.prune?.remove?.properties ?? base.prune.remove.properties,
        consts: override.prune?.remove?.consts ?? base.prune.remove.consts,
        variables: override.prune?.remove?.variables ?? base.prune.remove.variables,
        unusedImports: override.prune?.remove?.unusedImports ?? base.prune.remove.unusedImports,
      },
    },
    uglify: {
      enabled: override.uglify?.enabled ?? base.uglify.enabled,
    },
  };
}
