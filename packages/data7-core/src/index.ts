export { typeRefToString } from "./analysis/ast-context";
export { PROJECT_CONFIG_FILENAME } from "./infra/constants";
export { flatNameOf } from "./analysis/generics-analyzer";

// analysis
export * from "./analysis/declaration-reachability";
export * from "./analysis/ast-context";
export * from "./analysis/dependency-scanner";
export * from "./analysis/enumerable-detector";
export * from "./analysis/flow-analyzer";
export * from "./analysis/generics-analyzer";
export * from "./analysis/language-processor";
export * from "./analysis/analysis-program";
export * from "./analysis/analysis-host";
export * from "./analysis/file-snapshot";
export * from "./analysis/check-scheduler";
export * from "./analysis/expression-type-map";
export * from "./analysis/parse-config";
export * from "./analysis/analysis-cache";
export * from "./analysis/lint-pipeline-profiler";
export * from "./analysis/lint-diagnostic-transfer";
export * from "./analysis/lint-type-resolution-cache";
export * from "./analysis/lint-workspace-runner";
export * from "./analysis/lint-worker-pool";
export * from "./analysis/semantic-lint-cache";
export * from "./analysis/module-resolver";
export * from "./analysis/symbol-indexer";
export * from "./analysis/workspace-dependency-graph";
export * from "./analysis/type-resolver";

// diagnostics
export * from "./diagnostics/diagnostics";
export * from "./diagnostics/diagnostic-codes";
export * from "./diagnostics/diagnostic-helpers";
export * from "./diagnostics/ast-flow-analyzer";
export * from "./diagnostics/generic-diagnostics";
export * from "./diagnostics/structural-diagnostics";
export * from "./diagnostics/unused-code-analyzer";

// infra
export * from "./infra/configuration";
export * from "./infra/configuration-types";
export * from "./infra/extension-settings";
export * from "./infra/constants";
export * from "./infra/extension-paths";
export * from "./infra/logger";
export * from "./platform/vscode-api";

// project
export * from "./project/builder";
export * from "./project/decompiler";
export * from "./project/transpiler";
export * from "./project/transpiler-orchestrator";
export * from "./project/transpiler-types";
export * from "./project/generics";
export * from "./project/project-config";
export * from "./project/project-metadata";
export * from "./project/default-project-metadata";
export * from "./project/build-cache";
export * from "./project/build-snapshot";
export * from "./project/optimizer";
export * from "./project/source-map";
export * from "./project/ast/ast";
export * from "./project/ast/clone";
export * from "./project/parser";
export * from "./project/language/keywords";

// system-library
export * from "./system-library";
export * from "./system-library/docs-generator";

// utils
export * from "./utils/chain-prefix";
export * from "./utils/content-hash";
export * from "./utils/debounce";
export * from "./utils/format-helpers";
export * from "./utils/guid";
export * from "./utils/interpolation";
export * from "./utils/literal-type-infer";
export * from "./utils/path-safety";
export * from "./utils/performance";
export * from "./utils/primitive-types";
export * from "./utils/regex-helpers";
export * from "./utils/suppression-comments";
export * from "./utils/text-edit-utils";
export * from "./utils/xml-helpers";
export * from "./utils/symbol-kind";

// modules
export * from "./modules/manifest-registry";
export * from "./modules/repository-query-service";
export * from "./modules/dependency-synchronizer";
export * from "./modules/module-orchestrator";
