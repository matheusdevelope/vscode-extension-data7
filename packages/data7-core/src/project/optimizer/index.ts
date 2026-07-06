export {
  DEFAULT_BUILD_OPTIMIZATION_OPTIONS,
  resolveBuildOptimizationOptions,
  type BuildOptimizationOptions,
  type BuildOptimizationOverride,
  type MinifyOptimizationOptions,
  type PruneOptimizationOptions,
  type UglifyOptimizationOptions,
} from "./optimization-options";
export { minifyData7Text, type TextMinifyOptions } from "./minify";
export {
  pruneBuildModules,
  type PruneModuleInput,
  type PruneReport,
  type PruneResult,
} from "./prune";
