/**
 * Locator for the top-level `??` null-coalescing operator inside a Data7
 * Basic source line.
 *
 * Lives in `src/utils/` because both `src/project/transpiler.ts` (Builder)
 * and `src/diagnostics/diagnostics.ts` (live linter) need to detect `??`
 * — `diagnostics/` cannot import from `project/` per the architectural
 * fences in `governance.mdc`, so the shared parser has to live in a leaf
 * folder.
 *
 * The parser respects:
 *  - String literals `"..."` and `$"..."` — `??` inside strings is NOT an
 *    operator.
 *  - Line comments `'...` — `??` after the apostrophe is ignored.
 *  - Parenthesis / bracket nesting — only depth-0 `??` is considered.
 *
 * The function returns the position of the **first** `??` at depth 0. The
 * caller decides what to do with chained `?? ?? ??` (which is allowed in
 * principle — left-associative): the first occurrence becomes the outer
 * split, and the recursive expansion handles the rest.
 */

export interface NullCoalescePosition {
  /** 0-based column of the first `?` of the `??` token. */
  readonly opAt: number;
}

/**
 * Returns the position of the first top-level `??` token on `line`, or
 * `null` when no such operator is present.
 *
 * "Top-level" means: at parenthesis/bracket nesting depth 0, outside any
 * string literal, and outside any line comment.
 */
export function findTopLevelNullCoalesce(line: string): NullCoalescePosition | null {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '"' || (c === "$" && line[i + 1] === '"')) {
      i = skipStringLiteral(line, c === "$" ? i + 1 : i);
      continue;
    }

    if (c === "'") return null; // rest of the line is a comment

    if (c === "(" || c === "[") {
      depth++;
      continue;
    }
    if (c === ")" || c === "]") {
      depth--;
      continue;
    }

    if (depth !== 0) continue;

    if (c === "?" && line[i + 1] === "?") {
      return { opAt: i };
    }
  }
  return null;
}

/**
 * Advances `i` past a `"..."` string literal starting at the opening quote.
 * Returns the index of the closing quote so the caller's `for` increment
 * advances to the next character. Honours `""` escape.
 */
function skipStringLiteral(line: string, openQuoteIdx: number): number {
  let i = openQuoteIdx + 1;
  while (i < line.length) {
    const c = line[i];
    if (c === '"') {
      if (line[i + 1] === '"') {
        i += 2;
        continue;
      }
      return i;
    }
    i++;
  }
  return line.length - 1;
}
