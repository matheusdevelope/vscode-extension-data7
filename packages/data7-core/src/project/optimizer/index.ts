export {
  DEFAULT_BUILD_OPTIMIZATION_OPTIONS,
  DEFAULT_PRUNE_REMOVE_OPTIONS,
  resolveBuildOptimizationOptions,
  type BuildOptimizationOptions,
  type BuildOptimizationOverride,
  type MinifyOptimizationOptions,
  type PruneOptimizationOptions,
  type PruneRemoveOptions,
  type UglifyOptimizationOptions,
} from "./optimization-options";
export { minifyData7Text, minifyData7TextWithMap, type TextMinifyOptions } from "./minify";
export {
  pruneBuildModules,
  type PruneModuleInput,
  type PruneReport,
  type PruneResult,
} from "./prune";
export { uglifyBuildModules, type UglifyModuleInput, type UglifyResult } from "./uglify";
