/**
 * Pure text-rewriting parser for the `$"..."` string-interpolation sugar.
 *
 * Lives in `src/utils/` because both `src/project/transpiler.ts` (the
 * Builder pipeline) and `src/diagnostics/diagnostics.ts` (the live linter)
 * consume it — `diagnostics/` cannot import from `project/` per the
 * architectural fences in `governance.mdc`, so the shared parser has to
 * live in a leaf folder.
 *
 * The parser is intentionally regex-free and stateful: it walks the line
 * character-by-character so it can faithfully honour `"..."` regular string
 * literals (which must NOT be interpolated), `'...` line comments (likewise),
 * escaped quotes (`""`), and escaped braces (`{{` / `}}`).
 *
 * Concatenation in the expansion uses `&` — the canonical Basic string
 * operator (confirmed for the Data7 target).
 */

/**
 * One of the canonical reasons {@link parseInterpolation} stops mid-token.
 *
 *  - `"unterminated-string"`: a `$"...` opener with no closing `"`.
 *  - `"unterminated-brace"` : an interpolation `{expr` with no closing `}`.
 *  - `"empty-expression"`   : a `{}` (or `{   }`) with no actual expression.
 */
export type InterpolationFailure =
  | "unterminated-string"
  | "unterminated-brace"
  | "empty-expression";

export interface InterpolationDiagnostic {
  readonly reason: InterpolationFailure;
  /** 0-based column where the offending `$"` token begins on the input line. */
  readonly column: number;
}

export interface InterpolationResult {
  /** The rewritten line. Equal to the input when no `$"..."` token is present. */
  readonly line: string;
  /** Diagnostics produced while parsing — empty when the line is well-formed. */
  readonly diagnostics: readonly InterpolationDiagnostic[];
}

/**
 * Rewrites every `$"..."` token on `line` into a `"prefix" & (expr) & "suffix"`
 * expression. Tokens that fail to parse are left untouched in the output and
 * produce a {@link InterpolationDiagnostic} describing the failure mode and
 * the column where the offending `$"` starts.
 *
 * The function is a no-op (`{ line, diagnostics: [] }`) when `line` does not
 * contain the `$"` prefix anywhere, so callers can call it on every line
 * without branching.
 */
export function parseInterpolation(line: string): InterpolationResult {
  if (!line.includes('$"')) return { line, diagnostics: [] };

  let result = "";
  let i = 0;
  const diagnostics: InterpolationDiagnostic[] = [];
  while (i < line.length) {
    // `i < line.length` guarantees `line[i]` is defined; the `?? ""` keeps
    // `noUncheckedIndexedAccess` happy without changing runtime semantics.
    const ch = line[i] ?? "";

    // Line comment — everything from here on is preserved verbatim.
    if (ch === "'") {
      result += line.substring(i);
      break;
    }

    // Regular `"..."` literal — copy verbatim (honouring `""` escape).
    if (ch === '"') {
      result += '"';
      i++;
      while (i < line.length) {
        // `i < line.length` guarantees defined; `?? ""` satisfies the
        // `noUncheckedIndexedAccess` checker.
        const c = line[i] ?? "";
        if (c === '"') {
          if (line[i + 1] === '"') {
            result += '""';
            i += 2;
            continue;
          }
          result += '"';
          i++;
          break;
        }
        result += c;
        i++;
      }
      continue;
    }

    // Interpolation opener `$"`.
    if (ch === "$" && line[i + 1] === '"') {
      const startCol = i;
      i += 2;
      const pieces: string[] = [];
      let buffer = "";
      let terminated = false;
      let failure: InterpolationFailure | undefined;
      while (i < line.length) {
        const c = line[i] ?? "";
        if (c === '"') {
          if (line[i + 1] === '"') {
            buffer += '""';
            i += 2;
            continue;
          }
          terminated = true;
          i++;
          break;
        }
        if (c === "{") {
          if (line[i + 1] === "{") {
            buffer += "{";
            i += 2;
            continue;
          }
          pieces.push(`"${buffer}"`);
          buffer = "";
          let depth = 1;
          let expr = "";
          i++;
          while (i < line.length && depth > 0) {
            const cc = line[i] ?? "";
            if (cc === "{") depth++;
            else if (cc === "}") {
              depth--;
              if (depth === 0) break;
            }
            expr += cc;
            i++;
          }
          if (depth > 0) {
            failure = "unterminated-brace";
            break;
          }
          if (!expr.trim()) {
            failure = "empty-expression";
            break;
          }
          pieces.push(`(${expr.trim()})`);
          i++;
          continue;
        }
        if (c === "}") {
          if (line[i + 1] === "}") {
            buffer += "}";
            i += 2;
            continue;
          }
          buffer += c;
          i++;
          continue;
        }
        buffer += c;
        i++;
      }

      if (failure) {
        diagnostics.push({ reason: failure, column: startCol });
        // Preserve the rest of the line verbatim so the user sees exactly
        // where the parser stopped without further interpretation.
        result += line.substring(startCol);
        return { line: result, diagnostics };
      }
      if (!terminated) {
        diagnostics.push({ reason: "unterminated-string", column: startCol });
        result += line.substring(startCol);
        return { line: result, diagnostics };
      }

      pieces.push(`"${buffer}"`);
      const meaningful = pieces.filter((p) => p !== '""');
      result += meaningful.length > 0 ? meaningful.join(" & ") : '""';
      continue;
    }

    result += ch;
    i++;
  }
  return { line: result, diagnostics };
}
