/**
 * Pure literal-type inferrer for Data7 Basic source fragments.
 *
 * Lives in `src/utils/` because both `src/analysis/type-resolver.ts` (live
 * IntelliSense and linter) and `src/project/transpiler.ts` (Builder pipeline)
 * need to infer the type of a Right-Hand-Side expression — `project/` cannot
 * import from `analysis/` and vice-versa per the architectural fences in
 * `governance.mdc`, so the shared helper has to live in a leaf folder.
 *
 * The inferrer recognises:
 *  - String literals: `"abc"` -> `"String"`.
 *  - Integer literals: `42`, `-7`, `0xFF` -> `"Integer"`.
 *  - Double literals: `3.14`, `1e6` -> `"Double"`.
 *  - Boolean literals: `True`, `False` -> `"Boolean"`.
 *  - NULL: `NULL` -> `"Variant"` (caller may widen).
 *  - `New <Type>(...)`: -> the type name verbatim (preserving namespace dots).
 *  - `CType(<expr>, <Type>)`: -> the target type name.
 *  - Interpolation `$"..."`: -> `"String"`.
 *
 * Anything else returns `undefined` so callers can fall back to their own
 * resolution (member lookup, scope walk, etc.).
 */

const STRING_LITERAL_REGEX = /^"(?:[^"]|"")*"$/;
const INTEGER_LITERAL_REGEX = /^[+-]?(?:0[xX][0-9A-Fa-f]+|&[hH][0-9A-Fa-f]+|\d+)$/;
const DOUBLE_LITERAL_REGEX = /^[+-]?(?:\d+\.\d*|\.\d+|\d+[eE][+-]?\d+|\d+\.\d*[eE][+-]?\d+)$/;
const NEW_EXPR_REGEX = /^New\s+([\w.]+)\s*\(/i;
const CTYPE_EXPR_REGEX = /^CType\s*\(\s*.+?\s*,\s*([\w.]+)\s*\)\s*$/i;

/**
 * Infers the static type of a trimmed Data7 Basic expression fragment when it
 * is a recognised literal, `New T(...)` or `CType(_, T)` form.
 *
 * Returns `undefined` for any expression the inferrer does not handle —
 * callers should treat that as "unknown" and run their own resolver.
 *
 * The function is intentionally regex-only: no scope, no indexer, no
 * dependency on the VS Code API. It is safe to call from build-time (where
 * `vscode` is not available) and from tests.
 */
export function inferLiteralType(expr: string): string | undefined {
  const trimmed = expr.trim();
  if (!trimmed) return undefined;

  // `True` / `False` (case-insensitive).
  const lower = trimmed.toLowerCase();
  if (lower === "true" || lower === "false") return "Boolean";

  // `NULL` widens to Variant — callers may narrow if they have more context.
  if (lower === "null") return "Variant";

  // `New <Type>(...)` — same shape used by `TypeResolver.inferExpressionType`.
  const newMatch = NEW_EXPR_REGEX.exec(trimmed);
  if (newMatch?.[1]) return newMatch[1];

  // `CType(expr, T)` — propagate the cast target.
  const cTypeMatch = CTYPE_EXPR_REGEX.exec(trimmed);
  if (cTypeMatch?.[1]) return cTypeMatch[1];

  // String interpolation `$"..."` — always evaluates to String.
  if (trimmed.startsWith('$"')) return "String";

  // String literal `"..."` (with `""` escape).
  if (STRING_LITERAL_REGEX.test(trimmed)) return "String";

  // Numeric literals: Double has priority over Integer because the Double
  // pattern matches things the Integer pattern does not (`3.14`, `1e6`).
  if (DOUBLE_LITERAL_REGEX.test(trimmed)) return "Double";
  if (INTEGER_LITERAL_REGEX.test(trimmed)) return "Integer";

  return undefined;
}
