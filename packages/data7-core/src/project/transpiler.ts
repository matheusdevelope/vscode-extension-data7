/**
 * Public facade for the transpilation pipeline.
 *
 * The orchestration lives in `transpiler-orchestrator`; sugar implementations
 * live under `sugars/plugins` so they can evolve independently.
 */
export { SugarTranspiler } from "./transpiler-orchestrator";
export type { SugarDiagnostic, TranspileContext, TranspileResult } from "./transpiler-types";
export { ASTSugarTransformer } from "./sugars/plugins/ast/transformer";
