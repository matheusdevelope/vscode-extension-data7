/**
 * AST-based replacement for the textual generics pre-pass.
 *
 * Pipeline:
 *
 *   source string
 *      |
 *      v
 *   parseBasic(source)           ./parser
 *      |
 *      v
 *   GenericsMonomorphizer.run    ./generics-monomorphizer
 *      |
 *      v
 *   serializeUnit(unit)          ./parser
 *      |
 *      v
 *   rewritten source string
 *
 * The return shape matches {@link GenericsPassResult} from
 * `./generics-pass.ts` so callers can swap implementations behind a
 * feature flag (`data7.experimental.useAstGenerics`) without further
 * adaptation. Engine-level {@link MonomorphizationWarning}s are mapped
 * to the {@link GenericsPassWarning} shape used by the linter so the
 * Problems panel surfaces the same codes regardless of which pipeline
 * produced them.
 */

import type { GenericsPassWarning } from "../analysis/generics-analyzer";
import { GenericsMonomorphizer } from "./generics-monomorphizer";
import type { MonomorphizationWarning } from "./generics-monomorphizer";
import type { GenericsPassResult } from "./generics-pass";
import { parseBasic, serializeUnit } from "./parser";

/**
 * Runs the AST-based generics pipeline on `source` and returns a result
 * structurally compatible with {@link GenericsPassResult}.
 *
 * The `flatNames` field collects the names of every monomorphic
 * declaration the engine emitted, derived from the engine's
 * `instantiated` registry.
 */
export function runGenericsViaAST(source: string): GenericsPassResult {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const { unit, errors } = parseBasic(source);

  const engine = new GenericsMonomorphizer();
  const result = engine.monomorphize(unit);

  const rewritten = serializeUnit(result.unit, { eol });

  const warnings: GenericsPassWarning[] = result.warnings
    .map(mapMonomorphizationWarning)
    .filter((w): w is GenericsPassWarning => w !== null);

  // Surface parse errors as `unknown-template`-style warnings? No — they
  // are syntactic and should not collide with the engine's semantic
  // warnings. For now we let them drop here; the upcoming linter
  // integration (Phase 7) will surface parse errors separately.
  void errors;

  return {
    code: rewritten,
    flatNames: result.instantiated.values(),
    warnings,
  };
}

/**
 * Maps an engine warning code to the textual-pass equivalent so the
 * driver's output matches `runGenericsPass`. Unrecognised codes fall
 * through to `null` and are dropped (the only such code today is
 * `invalid-input`, which the textual pass cannot represent — it is a
 * low-level AST sanity check).
 */
function mapMonomorphizationWarning(w: MonomorphizationWarning): GenericsPassWarning | null {
  switch (w.code) {
    case "duplicate-template":
    case "unknown-template":
    case "class-generic-method-unsupported":
    case "flat-name-collision":
    case "instantiation-limit-exceeded":
      return buildWarning(w.code, w);
    case "arity-mismatch":
      // The engine uses `arity-mismatch` while the textual pass uses
      // the longer `generic-arity-mismatch` form. We harmonise on the
      // textual-pass code so downstream consumers (DiagnosticCodes,
      // examples-coverage) see the same identifier.
      return buildWarning("generic-arity-mismatch", w);
    case "invalid-input":
      return null;
    default: {
      const exhaustive: never = w.code;
      void exhaustive;
      return null;
    }
  }
}

function buildWarning(
  code: GenericsPassWarning["code"],
  w: MonomorphizationWarning,
): GenericsPassWarning {
  const out: GenericsPassWarning = { code, message: w.message };
  if (w.templateName !== undefined) Object.assign(out, { templateName: w.templateName });
  if (w.flatName !== undefined) Object.assign(out, { flatName: w.flatName });
  return out;
}
