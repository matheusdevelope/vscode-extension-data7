/**
 * Pure parser for "member access chains" in Data7 Basic — fragments such as
 * `a.b().c().d` that callers traverse step-by-step to resolve the type at
 * each link.
 *
 * Lives in `src/utils/` so the live type resolver (`src/analysis/`) and any
 * future transpiler step can share it without violating the architectural
 * fences in `governance.mdc`.
 *
 * The parser respects:
 *  - String literals `"..."` (with `""` escape) — `.`/`(`/`)` inside strings
 *    are NOT operators.
 *  - Interpolated strings `$"..."` — same treatment.
 *  - Parenthesis nesting — `.` inside `(...)` is part of the call argument,
 *    not a chain operator.
 *
 * Out of scope:
 *  - Argument-list parsing of each call (we just record presence/absence of
 *    `()` after each segment).
 *  - Operator expressions (`a.b + c.d`) — the parser stops at the first
 *    non-chain token after the root identifier.
 */

/**
 * One link in a parsed chain — either a property access (`name`) or a method
 * call (`name(...args)`). `hasCall` distinguishes the two: when `true`, the
 * link includes a paren group that the parser swallowed but did not analyse.
 */
export interface ChainSegment {
  /** The identifier at this segment (`b`, `c`, `d`, …). */
  readonly name: string;
  /** Whether this segment is followed by a `(...)` argument list. */
  readonly hasCall: boolean;
}

export interface ChainExpression {
  /** The leftmost identifier (the chain root: `a` in `a.b().c().d`). */
  readonly root: string;
  /** Subsequent segments after each `.`. Empty when the input is just `a`. */
  readonly segments: readonly ChainSegment[];
}

/**
 * Parses a trimmed expression that consists of:
 *
 *   `<ident>` (`.<ident>` (`(...)`)?)*
 *
 * Returns `null` when the input does not start with an identifier or the
 * shape is broken (e.g. trailing `.` with no segment, unmatched `(`).
 *
 * The parser is greedy: it consumes as much of the input as fits the chain
 * shape, then stops. Tokens after the chain (e.g. `+ 1`, `As Integer`) are
 * silently ignored — the caller should pass the RHS-only fragment.
 */
export function parseChain(expr: string): ChainExpression | null {
  const input = expr.trimStart();
  if (input.length === 0) return null;

  let i = 0;

  // Parse root identifier. The first char must be a letter or underscore;
  // subsequent chars may include digits.
  const rootStart = i;
  if (!isIdentStart(input.charCodeAt(i))) return null;
  i++;
  while (i < input.length && isIdentChar(input.charCodeAt(i))) {
    i++;
  }
  const root = input.slice(rootStart, i);

  const segments: ChainSegment[] = [];

  while (i < input.length) {
    // Skip whitespace between segments.
    while (i < input.length && isSpaceChar(input.charCodeAt(i))) i++;
    if (i >= input.length) break;

    if (input.charCodeAt(i) !== DOT_CC) break;
    i++; // consume the dot

    // After `.` we must have an identifier (otherwise the chain is malformed).
    const segStart = i;
    if (i >= input.length || !isIdentStart(input.charCodeAt(i))) return null;
    i++;
    while (i < input.length && isIdentChar(input.charCodeAt(i))) {
      i++;
    }
    const name = input.slice(segStart, i);

    // Optional `(...)` — must respect strings and nested parens.
    let hasCall = false;
    if (i < input.length && input.charCodeAt(i) === LPAREN_CC) {
      const closed = skipBalancedParens(input, i);
      if (closed < 0) return null;
      i = closed + 1;
      hasCall = true;
    }

    segments.push({ name, hasCall });
  }

  return { root, segments };
}

const DOT_CC = ".".charCodeAt(0);
const LPAREN_CC = "(".charCodeAt(0);
const RPAREN_CC = ")".charCodeAt(0);
const DQUOTE_CC = '"'.charCodeAt(0);
const DOLLAR_CC = "$".charCodeAt(0);

function isIdentStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    code === 95 // _
  );
}

function isIdentChar(code: number): boolean {
  return (
    isIdentStart(code) || (code >= 48 && code <= 57) // 0-9
  );
}

function isSpaceChar(code: number): boolean {
  return code === 32 || code === 9; // ' ' | '\t'
}

/**
 * Returns the index of the closing `)` that matches the `(` at `openIdx`, or
 * `-1` if the parens are unbalanced. Respects `"..."` and `$"..."` strings.
 */
function skipBalancedParens(input: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < input.length) {
    const c = input.charCodeAt(i);
    if (c === DQUOTE_CC) {
      i = skipStringLiteral(input, i);
      continue;
    }
    if (c === DOLLAR_CC && input.charCodeAt(i + 1) === DQUOTE_CC) {
      i = skipStringLiteral(input, i + 1);
      continue;
    }
    if (c === LPAREN_CC) {
      depth++;
    } else if (c === RPAREN_CC) {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Advances past a `"..."` literal starting at the opening quote. Returns the
 * index AFTER the closing quote so the caller can `i = skipStringLiteral(...)`
 * and continue the outer loop without an extra `i++`.
 *
 * Honours `""` as an escaped quote inside the literal.
 */
function skipStringLiteral(input: string, openQuoteIdx: number): number {
  let i = openQuoteIdx + 1;
  while (i < input.length) {
    if (input.charCodeAt(i) === DQUOTE_CC) {
      if (input.charCodeAt(i + 1) === DQUOTE_CC) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  // Unterminated — bail at end so the outer loop terminates naturally.
  return input.length;
}

/**
 * Walks backward from endIndex - 1, skipping balanced parentheses and brackets,
 * to find the start of the member access chain.
 */
export function getChainPrefix(line: string, endIndex: number): string {
  let i = endIndex - 1;
  let parenDepth = 0;
  let inString = false;

  while (i >= 0) {
    const c = line[i];
    if (c === undefined) {
      break;
    }
    if (c === '"') {
      inString = !inString;
      i--;
      continue;
    }
    if (inString) {
      i--;
      continue;
    }

    if (c === ")") {
      parenDepth++;
      i--;
      continue;
    } else if (c === "(") {
      parenDepth--;
      if (parenDepth < 0) {
        break;
      }
      // The `(` just closed a balanced paren group — it is part of the
      // call expression and must NOT be checked against the top-level
      // character filter.
      i--;
      continue;
    }

    if (parenDepth === 0) {
      // At top level of the chain, we only allow alphanumeric, _, ., and spaces/tabs
      if (c === "." || c === " " || c === "\t" || /[a-zA-Z0-9_]/.test(c)) {
        // Ok, continue
      } else {
        // Any other character (like =, +, -, comma at top level) stops the chain
        break;
      }
    }
    i--;
  }

  return line.substring(i + 1, endIndex).trim();
}
