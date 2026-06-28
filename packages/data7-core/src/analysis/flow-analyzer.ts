import { DependencyScanner } from "./dependency-scanner";

/**
 * Conservative null-narrowing flow analyser for Data7 Basic source.
 *
 * Given a document (as a line array) and a target line, returns the set of
 * variable names that the linter can treat as **definitely non-NULL** at that
 * point. The two recognised patterns mirror what real Data7 code uses:
 *
 *  1. Inside the `Then` block of `If x <> NULL Then ... End If`, `x` is
 *     non-NULL on every line of the block.
 *  2. After `If x = NULL Then Return / Throw / Exit Sub / Exit Function`,
 *     `x` is non-NULL on every line after the guard (until the end of the
 *     enclosing method).
 *
 * The analyser does NOT model:
 *
 *  - `ElseIf` / `Else` branches (only the `Then` block carries the fact).
 *  - Compound conditions (`If x <> NULL And y <> NULL Then`).
 *  - Reassignments that re-introduce NULL inside the guarded region.
 *  - Cross-method analysis.
 *
 * It is purely a *forward* fact propagator over a flat line array — no AST,
 * no control flow graph. Conservatism is intentional: a wrong narrowing
 * would make the linter silently miss real null-deref bugs.
 *
 * Lives in `src/analysis/` because the linter (`src/diagnostics/`) and the
 * `TypeResolver` are the consumers. The implementation has no `vscode`
 * dependency so it is easy to test.
 */

/** Comparison shape captured at the start of an `If`. */
type ComparisonKind = "neq-null" | "eq-null";

interface IfFrame {
  /** The variable name being compared. */
  readonly varName: string;
  /** Whether the comparison was `<> NULL` (carries fact to Then) or
   * `= NULL` (carries fact to lines AFTER an `Exit/Return/Throw` inside). */
  readonly kind: ComparisonKind;
  /** Indentation of the `If` header — used to detect single-line `If`. */
  readonly headerIndent: string;
  /** Whether the `If` had `Then` followed by a same-line statement
   * (single-line form). */
  readonly singleLine: boolean;
}

/**
 * Returns the lowercase names of variables proven non-NULL at `targetLine`
 * (0-based) inside the document text. Returns `undefined` if no narrowing
 * is applicable.
 *
 * Callers can intersect this set with the variable they are about to
 * resolve to know whether NULL deref is possible.
 */
export function getNonNullVariablesAt(
  documentText: string,
  targetLine: number,
): ReadonlySet<string> {
  const facts = new Set<string>();
  const lines = documentText.split(/\r?\n/);
  const stack: IfFrame[] = [];

  for (let i = 0; i <= targetLine && i < lines.length; i++) {
    const raw = lines[i];
    if (raw === undefined) continue;
    const clean = DependencyScanner.stripComments(raw).trim();
    if (!clean) continue;

    // Detect single-line guard:
    //   `If x = NULL Then Return ...` / `Throw ...` / `Exit Sub` / `Exit Function`
    // These propagate `NotNull(x)` to lines AFTER `i` until the method ends
    // (we approximate "until end of file" — the linter is single-method
    // scope anyway, and the fact only matters inside the same method).
    const singleLineGuard = matchSingleLineEqNullGuard(clean);
    if (singleLineGuard) {
      facts.add(singleLineGuard.toLowerCase());
      continue;
    }

    // Detect block opening: `If <var> <> NULL Then` (multi-line — nothing
    // after `Then` on the same line). The fact applies inside the block
    // (until matching `End If`), so we push on the stack and the line
    // walker below decides when to drop it.
    const blockHeader = matchBlockIfNullCompare(raw);
    if (blockHeader) {
      stack.push(blockHeader);
      if (blockHeader.kind === "neq-null") {
        // The fact is live for the immediate `Then` block — push a *frame*
        // fact onto the running set; we pop it on `End If`.
        facts.add(blockHeader.varName.toLowerCase());
      }
      continue;
    }

    // `End If` closes the current frame. When the frame was `neq-null` we
    // remove the variable from the live facts. When the frame was
    // `eq-null` we do nothing — the single-line-guard form is what
    // propagates `eq-null` past the block.
    if (/^End\s+If\b/i.test(clean)) {
      const popped = stack.pop();
      if (popped?.kind === "neq-null") {
        // Only drop the fact if no later guard re-introduced it.
        // Conservative: re-scan the stack for the same var.
        const stillHeld = stack.some(
          (f) => f.kind === "neq-null" && f.varName.toLowerCase() === popped.varName.toLowerCase(),
        );
        if (!stillHeld) facts.delete(popped.varName.toLowerCase());
      }
      continue;
    }

    // `Else` / `ElseIf` swap the polarity of the current frame. For now we
    // simply DROP the `Then`-block fact (conservative) — implementing
    // proper else-narrowing requires understanding which condition we are
    // in, which is out of scope.
    if (/^Else(If)?\b/i.test(clean)) {
      const top = stack[stack.length - 1];
      if (top?.kind === "neq-null") facts.delete(top.varName.toLowerCase());
      continue;
    }
  }

  return facts;
}

/**
 * Single-line guard recognition: `If <var> = NULL Then <Return|Throw|Exit ...>`.
 * Returns the variable name when the pattern matches.
 *
 * The fact is "after this guard, `<var>` is definitely non-NULL" because the
 * guard early-returns the method.
 */
function matchSingleLineEqNullGuard(clean: string): string | undefined {
  // Captures the variable name + trailing exit/return/throw statement.
  const m = /^If\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*=\s*NULL\s+Then\s+(.+)$/i.exec(clean);
  if (!m) return undefined;
  const tail = (m[2] ?? "").trim();
  if (!isShortCircuitStatement(tail)) return undefined;
  return m[1];
}

function isShortCircuitStatement(stmt: string): boolean {
  return (
    /^Return\b/i.test(stmt) ||
    /^Throw\b/i.test(stmt) ||
    /^Exit\s+(Sub|Function|Property)\b/i.test(stmt)
  );
}

/**
 * Recognises a multi-line `If` header that compares a variable against NULL.
 * Returns the captured frame, or `undefined` when the line is not a block
 * header (single-line `If x = NULL Then Return` falls through here because
 * the trailing statement disqualifies it).
 */
function matchBlockIfNullCompare(raw: string): IfFrame | undefined {
  // Compute indent then strip-comments-trim for content matching.
  const indentMatch = /^(\s*)/.exec(raw);
  const headerIndent = indentMatch?.[1] ?? "";
  const clean = DependencyScanner.stripComments(raw).trim();
  if (!clean) return undefined;

  // Multi-line header: `If <var> <op> NULL Then` with NOTHING after `Then`.
  const m = /^If\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(<>|=)\s*NULL\s+Then\s*$/i.exec(clean);
  if (!m) return undefined;
  const varName = m[1] ?? "";
  const op = m[2] ?? "";
  if (!varName) return undefined;
  return {
    varName,
    kind: op === "<>" ? "neq-null" : "eq-null",
    headerIndent,
    singleLine: false,
  };
}
