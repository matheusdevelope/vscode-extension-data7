/**
 * Parser for Data7 Basic destructuring patterns:
 *
 *  - Object: `{ Nome, Idade }`, `{ Nome As n }`, `{ Nome As n = "x" }`.
 *  - Array:  `[first, second]`, `[first, ...rest]`.
 *
 * Lives in `src/utils/` so the live linter and the build-time transpiler
 * share the parsing logic without crossing the architectural fences in
 * `governance.mdc`.
 *
 * The grammar is intentionally simple: at most one level of nesting is
 * supported. Deeper patterns surface as `destructure-too-deep` for the
 * transpiler to flag.
 */

export interface ObjectBinding {
  /** Member name on the RHS object (e.g. `Nome`). */
  readonly member: string;
  /** Local name introduced by the binding — equal to `member` by default. */
  readonly local: string;
  /** Optional default expression (everything after `=`). */
  readonly defaultExpr?: string;
}

export interface ArrayBinding {
  /** Local name for the indexed element. */
  readonly local: string;
  /** `true` when this binding is the `...rest` tail. */
  readonly isRest: boolean;
}

/**
 * Parses an object destructuring body (everything BETWEEN the `{` and `}`).
 * Returns `null` when the body is malformed.
 */
export function parseObjectDestructure(body: string): ObjectBinding[] | null {
  const parts = splitTopLevelByComma(body);
  if (parts === null) return null;
  const bindings: ObjectBinding[] = [];
  for (const part of parts) {
    // Each part is `Member` | `Member As Local` | `Member As Local = default`.
    const m = /^([A-Za-z_]\w*)(?:\s+As\s+([A-Za-z_]\w*))?(?:\s*=\s*(.+))?$/i.exec(part.trim());
    if (!m) return null;
    const member = m[1] ?? "";
    const local = m[2] ?? member;
    const defaultExpr = m[3]?.trim();
    if (!member || !local) return null;
    const binding: ObjectBinding =
      defaultExpr !== undefined ? { member, local, defaultExpr } : { member, local };
    bindings.push(binding);
  }
  return bindings;
}

/**
 * Parses an array destructuring body (everything BETWEEN the `[` and `]`).
 * Returns `null` when the body is malformed.
 *
 * A `...rest` token is only valid as the LAST binding.
 */
export function parseArrayDestructure(body: string): ArrayBinding[] | null {
  const parts = splitTopLevelByComma(body);
  if (parts === null) return null;
  const bindings: ArrayBinding[] = [];
  for (let i = 0; i < parts.length; i++) {
    const trimmed = (parts[i] ?? "").trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("...")) {
      const local = trimmed.slice(3).trim();
      if (!/^[A-Za-z_]\w*$/.test(local)) return null;
      if (i !== parts.length - 1) return null; // rest must be last
      bindings.push({ local, isRest: true });
      continue;
    }
    if (!/^[A-Za-z_]\w*$/.test(trimmed)) return null;
    bindings.push({ local: trimmed, isRest: false });
  }
  return bindings;
}

/**
 * Splits a comma-separated list while respecting `"..."` strings and
 * parenthesis/bracket nesting. Returns `null` when the input is malformed
 * (e.g. unbalanced parens).
 */
function splitTopLevelByComma(input: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i] ?? "";
    if (c === '"') {
      if (inString && input[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      parts.push(input.slice(start, i));
      start = i + 1;
    }
    if (depth < 0) return null;
  }
  if (depth !== 0 || inString) return null;
  const tail = input.slice(start);
  if (tail.trim()) parts.push(tail);
  return parts;
}
