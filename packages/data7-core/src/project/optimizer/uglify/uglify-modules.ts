import type { UglifyOptimizationOptions } from "../optimization-options";

export interface UglifyModuleInput {
  readonly moduleName: string;
  readonly fileUri: string;
  readonly code: string;
}

export interface UglifyResult {
  readonly modules: ReadonlyMap<string, string>;
}

/**
 * Placeholder for future aggressive symbol renaming.
 * When `enabled` is false (default), returns inputs unchanged.
 */
export function uglifyBuildModules(
  modules: readonly UglifyModuleInput[],
  options: UglifyOptimizationOptions,
): UglifyResult {
  if (!options.enabled) {
    return {
      modules: new Map(modules.map((module) => [module.moduleName, module.code])),
    };
  }
  // Future: rename user declarations while preserving System Library / keep-name.
  return {
    modules: new Map(modules.map((module) => [module.moduleName, module.code])),
  };
}
