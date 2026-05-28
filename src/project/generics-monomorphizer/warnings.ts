/**
 * Stable warning codes emitted by {@link GenericsMonomorphizer}.
 *
 * Codes are short, kebab-case strings — chosen to match the convention used
 * by the project's diagnostics layer (`src/diagnostics/diagnostic-codes.ts`)
 * so they can be lifted into the public diagnostics surface later without
 * renaming.
 *
 * Code summary:
 *
 *  - `duplicate-template`: Two top-level generic declarations share the
 *    same name (e.g. two `Class Box<T>` in the unit). The latest wins.
 *
 *  - `unknown-template`: A usage site references a generic template that is
 *    not registered (typo, missing import, or external library type). The
 *    site is left untouched so the downstream compiler can surface a real
 *    error.
 *
 *  - `arity-mismatch`: A usage site supplies a wrong number of type
 *    arguments for the referenced template. The instantiation is skipped.
 *
 *  - `class-generic-method-unsupported`: A generic method declared inside a
 *    class (`Class Foo: Sub Bar<T>(…) End Class`). The current engine does
 *    not support generic method instantiation through a receiver, so the
 *    declaration is removed from the class to keep the downstream AST
 *    free of `<T>` syntax. `templateName` is `"<ClassName>.<MethodName>"`.
 *
 *  - `flat-name-collision`: Two structurally distinct usages flatten to the
 *    same name (e.g. `Dict<TList<Integer>, String>` and
 *    `Dict<TList, Integer_String>` both produce `Dict_TList_Integer_String`
 *    when the source already contains a type whose name carries `_`).
 *    Both still emit the same concrete declaration; the warning surfaces
 *    the ambiguity so the caller can rename the offending source type.
 *
 *  - `instantiation-limit-exceeded`: The worklist drained more than
 *    {@link MAX_INSTANTIATIONS} entries — usually a sign that the AST
 *    contains a feedback loop the engine cannot terminate. Drain stops and
 *    the partial result is returned.
 *
 *  - `invalid-input`: The input AST violates a basic well-formedness
 *    constraint (empty declaration name, empty type-reference name, empty
 *    type-parameter name). The offending site is skipped.
 */
export type MonomorphizationWarningCode =
  | "duplicate-template"
  | "unknown-template"
  | "arity-mismatch"
  | "class-generic-method-unsupported"
  | "flat-name-collision"
  | "instantiation-limit-exceeded"
  | "invalid-input";

export interface MonomorphizationWarning {
  readonly code: MonomorphizationWarningCode;
  readonly message: string;
  /** Original (un-flattened) name of the template, when applicable. */
  readonly templateName?: string;
  /** Flat name of the offending instantiation, when applicable. */
  readonly flatName?: string;
}
