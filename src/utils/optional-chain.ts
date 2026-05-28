/**
 * Locator for `?.` (optional chaining) tokens in a Data7 Basic source line.
 *
 * Lives in `src/utils/` so the transpiler and the linter share it without
 * crossing the architectural fences in `governance.mdc`.
 *
 * The parser respects:
 *  - String literals `"..."` and `$"..."` — `?.` inside strings is NOT an
 *    operator.
 *  - Line comments `'...` — `?.` after the apostrophe is ignored.
 *  - Parenthesis / bracket nesting — only depth-0 occurrences are reported.
 *
 * NOTE: the transpiler must distinguish `?.` from the ternary `?` and from
 * the null-coalescing `??`. We achieve this by requiring that `?` be
 * immediately followed by `.` (no whitespace between them).
 */

export interface OptionalChainPosition {
  /** 0-based column of the `?` token. The matching `.` is at `opAt + 1`. */
  readonly opAt: number;
}

/**
 * Returns the position of the FIRST top-level `?.` token on `line`, or
 * `null` when no such operator is present. Callers that need every
 * occurrence call this repeatedly, slicing off the prefix that was already
 * consumed.
 */
export function findFirstOptionalChain(line: string): OptionalChainPosition | null {
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

    // Optional chain: `?.` (no whitespace between them). Distinguish from
    // `??` (null-coalesce — handled by null-coalesce.ts) and `?` followed
    // by a space (ternary — handled by ternary.ts).
    if (c === "?" && line[i + 1] === "." && line[i + 2] !== ".") {
      return { opAt: i };
    }
  }
  return null;
}

/**
 * Counts the number of `?.` tokens in `line`. Useful for the
 * `optional-chain-too-deep` diagnostic.
 */
export function countOptionalChainTokens(line: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor < line.length) {
    const slice = line.substring(cursor);
    const m = findFirstOptionalChain(slice);
    if (!m) break;
    count++;
    cursor += m.opAt + 2; // past `?.`
  }
  return count;
}

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
