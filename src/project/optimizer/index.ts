export {
  DEFAULT_BUILD_OPTIMIZATION_OPTIONS,
  resolveBuildOptimizationOptions,
  type BuildOptimizationOptions,
  type BuildOptimizationOverride,
  type MinifyOptimizationOptions,
  type UglifyOptimizationOptions,
} from "./optimization-options";
export { minifyData7Text, type TextMinifyOptions } from "./minify";
export {
  removeUnusedDeclarations,
  type RemoveUnusedModuleInput,
  type RemoveUnusedResult,
} from "./minify";
