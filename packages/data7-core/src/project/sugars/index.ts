export { SugarEngine } from "./engine";
export { SugarRegistry } from "./registry";
export { sugarOptionsWithStackTrace } from "./stack-trace-options";
export {
  STACK_TRACE_MODULE_NAME,
  STACK_TRACE_NAMESPACE,
  STACK_TRACE_SUGAR_ID,
  StackTraceSugarTransformer,
  packagedUnitFileName,
  rewriteGeneratedStackTraceLocations,
} from "./plugins/stack-trace";
export type {
  SugarCatalogEntry,
  SugarEngineOptions,
  SugarPlugin,
  SugarUtilityModule,
} from "./types";
