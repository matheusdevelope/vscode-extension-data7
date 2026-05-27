/**
 * Detects inline suppression directives that opt-out specific diagnostic codes
 * from the linter on a per-line basis.
 *
 * Supported forms (case-insensitive):
 *
 *   ' data7:disable-line                    → suppresses ALL codes on this line
 *   ' data7:disable-line missing-import     → suppresses one code on this line
 *   ' data7:disable-line code-a,code-b      → suppresses several codes on this line
 *   ' data7:disable-next-line <codes?>      → applies to the next non-blank line
 *
 * `REM data7:disable-line` is also accepted (Data7 Basic comment alias).
 *
 * The helper returns a `Map<lineIndex, Set<DiagnosticCode> | '*'>`. A value of
 * `'*'` means "suppress every code on that line"; otherwise the set lists the
 * codes the user wants ignored.
 *
 * Keeping this in `util/` (rather than inside `diagnostics.ts`) makes it
 * trivially testable in isolation and lets future tools (formatter, code
 * actions) reuse the same parser.
 */

export type SuppressionTarget = "*" | ReadonlySet<string>;

const DIRECTIVE_REGEX =
  /(?:'|REM\s)\s*data7:(disable-line|disable-next-line)(?:\s+([a-zA-Z0-9_\-, ]+))?/i;

/**
 * Parses all `data7:disable-*` directives in `text` and returns the set of
 * codes to suppress per zero-based line index.
 *
 * `disable-next-line` resolves to the next line that contains non-whitespace,
 * non-comment content. When the file ends before that, the directive is dropped
 * silently (matches the user expectation that "next-line" means "the next
 * meaningful line").
 */
export function extractSuppressedCodes(text: string): Map<number, SuppressionTarget> {
  const map = new Map<number, SuppressionTarget>();
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = DIRECTIVE_REGEX.exec(line);
    if (!match?.[1]) continue;

    const kind = match[1].toLowerCase();
    const codes = parseCodes(match[2]);

    if (kind === "disable-line") {
      mergeSuppression(map, i, codes);
    } else if (kind === "disable-next-line") {
      const targetLine = findNextNonBlankLine(lines, i + 1);
      if (targetLine !== -1) mergeSuppression(map, targetLine, codes);
    }
  }

  return map;
}

/**
 * Returns `true` when the given diagnostic should be suppressed on its line.
 */
export function isSuppressed(
  suppressions: ReadonlyMap<number, SuppressionTarget>,
  lineIndex: number,
  code: string | undefined,
): boolean {
  const target = suppressions.get(lineIndex);
  if (!target) return false;
  if (target === "*") return true;
  return code !== undefined && target.has(code);
}

/**
 * A single suppression directive parsed from the source. Unlike
 * {@link extractSuppressedCodes} — which already collapses directives into a
 * line-index map — this iterator preserves the raw directive position so the
 * linter can emit `unknown-suppression-code` warnings pointing at the exact
 * typo.
 *
 * `codes` is `undefined` for a bare directive (`' data7:disable-line` without
 * a code list, meaning "suppress everything"); validation rules can skip
 * those since there is no specific code to check.
 */
export interface SuppressionDirective {
  /** 0-based line index where the directive appears. */
  readonly line: number;
  /** 0-based column where the first code character begins. */
  readonly codesColumn: number;
  /** Parsed list of codes, or `undefined` for a bare `disable-line` / `disable-next-line`. */
  readonly codes?: readonly string[];
}

/**
 * Yields every `' data7:disable-line` / `' data7:disable-next-line` directive
 * found in `text`, in source order. Used by the linter to validate that each
 * referenced code exists in `DiagnosticCodes`.
 */
export function listSuppressionDirectives(text: string): SuppressionDirective[] {
  const out: SuppressionDirective[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = DIRECTIVE_REGEX.exec(line);
    if (!match) continue;
    const rawCodes = match[2];
    const codes = rawCodes
      ? rawCodes
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : undefined;
    // `match.index` points at the start of the directive; offset to the first
    // code character so highlight ranges sit on the bogus code, not on the
    // `data7:` prefix.
    const codesColumn = rawCodes ? line.indexOf(rawCodes, match.index) : match.index;
    out.push({ line: i, codesColumn, codes });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseCodes(raw: string | undefined): SuppressionTarget {
  if (!raw?.trim()) return "*";
  const set = new Set<string>();
  for (const piece of raw.split(/[,\s]+/)) {
    const trimmed = piece.trim().toLowerCase();
    if (trimmed) set.add(trimmed);
  }
  return set.size === 0 ? "*" : set;
}

function mergeSuppression(
  map: Map<number, SuppressionTarget>,
  line: number,
  add: SuppressionTarget,
): void {
  const existing = map.get(line);
  if (!existing) {
    map.set(line, add);
    return;
  }
  if (existing === "*" || add === "*") {
    map.set(line, "*");
    return;
  }
  const merged = new Set(existing);
  for (const c of add) merged.add(c);
  map.set(line, merged);
}

function findNextNonBlankLine(lines: readonly string[], startIdx: number): number {
  for (let i = startIdx; i < lines.length; i++) {
    const cleaned = (lines[i] ?? "")
      .replace(/'.*$/, "")
      .replace(/\bREM\b.*$/i, "")
      .trim();
    if (cleaned.length > 0) return i;
  }
  return -1;
}
