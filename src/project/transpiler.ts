import { DependencyScanner } from "../analysis/dependency-scanner";
import type { EnumerableInfo } from "../analysis/enumerable-detector";
import { parseInterpolation } from "../utils/interpolation";
import { findTopLevelTernary } from "../utils/ternary";

/**
 * Diagnostic emitted by {@link SugarTranspiler.transpile} when a sugar rule
 * (or inline transform) recognises its trigger but cannot expand it.
 *
 * The transpiler leaves the offending content untouched in the output so the
 * downstream `.7Proj` is still parseable; the diagnostic is the caller's hook
 * to surface a warning (Builder) or a linter Diagnostic.
 *
 * Each `code` carries its own conventions on `typeName` (overloaded as a
 * "context" payload):
 *  - `not-enumerable`: `typeName` is the resolved operand type or `"Variant"`.
 *  - `invalid-interpolation`: `typeName` is one of `"unterminated-string"`,
 *    `"unterminated-brace"`, `"empty-expression"` — the failure mode.
 *  - `ternary-context-unsupported`: `typeName` is `"non-assignment"` — the
 *    only context kind currently surfaced.
 */
export interface SugarDiagnostic {
  readonly code: "not-enumerable" | "invalid-interpolation" | "ternary-context-unsupported";
  /** 0-based line index in the input `code`. */
  readonly line: number;
  /** 0-based column index, pointing at the start of the sugar token. */
  readonly column: number;
  /** Context payload — see the `code`-specific conventions above. */
  readonly typeName: string;
}

/**
 * Injected context used by the registry of sugar rules. New rules that need
 * extra capabilities (e.g. resolving a class hierarchy) should extend this
 * interface rather than passing parameters through {@link SugarTranspiler.transpile}.
 *
 * The function should walk the inheritance chain — the transpiler does not.
 */
export interface TranspileContext {
  detectEnumerable(typeName: string, preferredElementType?: string): EnumerableInfo | undefined;
}

export interface TranspileResult {
  readonly code: string;
  readonly diagnostics: readonly SugarDiagnostic[];
}

/**
 * Successful expansion produced by a {@link SugarRule}. The transpiler
 * substitutes the original input line with `replacement` (one or more lines)
 * and forwards `diagnostics` (if any) to the caller.
 *
 * Returning `replacement: [originalLine]` is a no-op: it preserves the line
 * verbatim. Rules use this when they detect their pattern but refuse to
 * expand (so the next rule does not also try and so the diagnostic is
 * attached to that specific situation).
 */
export interface SugarMatchResult {
  readonly replacement: readonly string[];
  readonly diagnostics?: readonly SugarDiagnostic[];
}

/**
 * Per-line scratchpad the transpiler hands to each rule. Counters are
 * monotonically increasing across the whole file — siblings and nested
 * loops therefore never produce colliding `__idxN` / `__srcN` names.
 */
export interface TranspileLineContext {
  readonly ctx: TranspileContext;
  readonly allLines: readonly string[];
  readonly lineIdx: number;
  /** Returns a fresh `__idxN` identifier. */
  freshIndex(): string;
  /** Returns a fresh `__srcN` identifier. */
  freshSource(): string;
}

/**
 * Contract for one sugar that the transpiler knows how to expand.
 * Implementations are stateless and pure — they receive everything they need
 * via {@link TranspileLineContext}.
 *
 * `match` is called once per line. Returning `null` means "this line is not
 * my pattern; try the next rule". Returning a {@link SugarMatchResult}
 * commits the line: subsequent rules are not consulted for the same line.
 */
export interface SugarRule {
  readonly name: string;
  match(cleanLine: string, rawLine: string, context: TranspileLineContext): SugarMatchResult | null;
}

// ---------------------------------------------------------------------------
// Helpers shared by the built-in rules
// ---------------------------------------------------------------------------

/**
 * Matches a backwards `<name> As <Type>` binding for `<name>`. Accepts the
 * canonical declaration prefixes and method-parameter syntax (`Sub Foo(name As T)`).
 */
function buildVarDeclRegex(varName: string): RegExp {
  return new RegExp(`(?:^|[^A-Za-z0-9_])${varName}\\s+As\\s+(?:New\\s+)?([\\w.]+)`, "i");
}

/**
 * Matches `<name> = New <Type>(...)` so we can infer the operand type even
 * when the user wrote `Dim list = New StringList()` without the `As` clause.
 */
function buildNewExprRegex(varName: string): RegExp {
  return new RegExp(`\\b${varName}\\s*=\\s*New\\s+([\\w.]+)\\s*\\(`, "i");
}

/**
 * Walks backwards from `beforeLineIdx` looking for the type bound to
 * `operand`. Mirrors {@link TypeResolver.getVariableType} but operates on raw
 * text — the transpiler avoids depending on the live indexer.
 */
function inferOperandType(
  operand: string,
  lines: readonly string[],
  beforeLineIdx: number,
): string | undefined {
  if (!/^[A-Za-z_]\w*$/.test(operand)) return undefined;
  const declRegex = buildVarDeclRegex(operand);
  const newRegex = buildNewExprRegex(operand);
  for (let i = beforeLineIdx; i >= 0; i--) {
    const lineText = lines[i];
    if (lineText === undefined) continue;
    const cleanLine = DependencyScanner.stripComments(lineText);
    if (!cleanLine.trim()) continue;
    const declMatch = cleanLine.match(declRegex);
    if (declMatch?.[1]) return declMatch[1];
    const newMatch = cleanLine.match(newRegex);
    if (newMatch?.[1]) return newMatch[1];
  }
  return undefined;
}

/**
 * Conservative side-effect heuristic: any non-identifier expression is
 * materialised into a `__src` temporary before the expansion. False positives
 * cost one extra `Dim` line in the `.7Proj`; false negatives would silently
 * re-evaluate the operand N times.
 */
function isComplexExpression(expr: string): boolean {
  return /[(.\s+\-*/&,]/.test(expr);
}

/**
 * Returns the trailing comment of `line` (starting with `'`), respecting
 * double-quoted strings so a literal `'` is not mistaken for a comment.
 */
function extractTrailingComment(line: string): string | undefined {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === "'") {
      return line.slice(i).trim() || undefined;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Built-in rule: `For Each <var>[ As <T>] In <start>..<end>` (numeric range)
// ---------------------------------------------------------------------------

const FOR_EACH_RANGE_REGEX =
  /^(\s*)For\s+Each\s+(\w+)(?:\s+As\s+[\w.]+)?\s+In\s+(.+?)\s*\.\.\s*(.+?)\s*$/i;

/**
 * Expands `For Each <var>[ As <Integer>] In <start>..<end>` into the classic
 * `For <var> = <start> To <end>` form. Operates BEFORE the generic For Each
 * rule so the `..` shape wins — the generic rule would otherwise fail to
 * resolve the operand as enumerable and emit a `not-enumerable` warning.
 *
 * The explicit `As <Type>` clause is intentionally ignored: the native `For`
 * statement does not carry a typed binding (the variable is implicitly
 * `Integer`), so the user can use `As Integer` for documentation but the
 * transpiler does not propagate it.
 */
const forEachRangeSugarRule: SugarRule = {
  name: "for-each-range",
  match(cleanLine, rawLine, _context) {
    const match = FOR_EACH_RANGE_REGEX.exec(cleanLine);
    if (!match) return null;

    const leadingIndent = match[1] ?? "";
    const loopVar = match[2];
    const start = (match[3] ?? "").trim();
    const end = (match[4] ?? "").trim();
    if (!loopVar || !start || !end) return null;

    const trailing = extractTrailingComment(rawLine);
    const head = `${leadingIndent}For ${loopVar} = ${start} To ${end}`;
    return { replacement: [trailing ? `${head} ${trailing}` : head] };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `For Each <var>[ As <T>] In <expr>` (enumerable collection)
// ---------------------------------------------------------------------------

const FOR_EACH_REGEX = /^(\s*)For\s+Each\s+(\w+)(?:\s+As\s+([\w.]+))?\s+In\s+(.+?)\s*$/i;

/**
 * Expands `For Each <var>[ As <T>] In <expr>` into the classic Data7 form.
 * See {@link SugarTranspiler} for the high-level invariants.
 */
const forEachSugarRule: SugarRule = {
  name: "for-each",
  match(cleanLine, rawLine, context) {
    const match = FOR_EACH_REGEX.exec(cleanLine);
    if (!match) return null;

    const leadingIndent = match[1] ?? "";
    const loopVar = match[2];
    // `match[3]` is the optional `As <Type>` group — `string | undefined`.
    const explicitType: string | undefined = match[3];
    const operand = (match[4] ?? "").trim();
    if (!loopVar || !operand) return null;

    const operandType = inferOperandType(operand, context.allLines, context.lineIdx - 1);
    const enumerable = operandType
      ? context.ctx.detectEnumerable(operandType, explicitType)
      : undefined;

    if (!enumerable) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "not-enumerable",
            line: context.lineIdx,
            column: leadingIndent.length,
            typeName: operandType ?? "Variant",
          },
        ],
      };
    }

    const elementType = explicitType ?? enumerable.elementType;
    const needsTemp = isComplexExpression(operand);
    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = leadingIndent + "   ";
    const out: string[] = [];

    const srcRef = needsTemp ? context.freshSource() : operand;
    if (needsTemp) {
      out.push(`${leadingIndent}Dim ${srcRef} = ${operand}`);
    }

    const idxVar = context.freshIndex();
    out.push(`${leadingIndent}For ${idxVar} = 0 To ${srcRef}.${enumerable.countMember} - 1`);
    const dimLine = `${innerIndent}Dim ${loopVar} As ${elementType} = ${srcRef}.${enumerable.indexerMember}(${idxVar})`;
    out.push(trailingComment ? `${dimLine} ${trailingComment}` : dimLine);

    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `<lhs> [As <T>] = <cond> ? <a> : <b>` (ternary assignment)
// ---------------------------------------------------------------------------

/**
 * Matches an assignment whose RHS may contain a top-level ternary. The
 * regex captures the surface (`Dim` keyword optional, target identifier
 * with optional member access, optional `As <Type>` clause, then `=` and
 * everything after). The actual ternary detection is delegated to
 * {@link findTopLevelTernary} on the RHS.
 *
 * Group 1: leading indent.
 * Group 2: optional declaration keyword (`Dim`/`Public`/`Private`/…).
 * Group 3: target — `name` or `obj.prop` chain.
 * Group 4: optional `As <Type>` (without the `As` keyword).
 * Group 5: RHS expression (everything after `=`).
 */
const TERNARY_ASSIGN_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:As\s+([\w.]+)\s*)?=\s*(.+)$/i;

/**
 * Expands a single-line ternary `cond ? a : b` into the native multi-line
 * `If/Then/Else/End If` form. Only the RHS of an assignment surface is
 * supported: `Dim x [As T] = c ? a : b`, `x = c ? a : b`,
 * `obj.prop = c ? a : b`. Ternaries in any other position (`Print c ? a : b`,
 * `Foo(c ? a : b)`, `Return c ? a : b`, …) emit `ternary-context-unsupported`
 * and the offending line is preserved verbatim — those forms would require
 * a temp variable + extra lines that change the visible structure of the
 * surrounding code, which the user must do by hand.
 *
 * The `?` and `:` operators are located by {@link findTopLevelTernary},
 * which respects strings, line comments and parentheses (so
 * `Dim s = "what?"` does not match and `Dim x = (a ? b : c) + 1` does not
 * either, since the `?` sits at depth 1).
 *
 * Trailing inline comment on the source line is reattached to the `If`
 * header so the user's intent survives the expansion.
 */
const ternarySugarRule: SugarRule = {
  name: "ternary",
  match(cleanLine, rawLine, context) {
    const ternary = findTopLevelTernary(cleanLine);
    if (!ternary) return null;

    const assign = TERNARY_ASSIGN_REGEX.exec(cleanLine);
    if (!assign) {
      // Ternary on a non-assignment line — flag and leave the line as-is.
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "ternary-context-unsupported",
            line: context.lineIdx,
            column: ternary.questionAt,
            typeName: "non-assignment",
          },
        ],
      };
    }

    const indent = assign[1] ?? "";
    const dimKeyword = assign[2];
    const target = assign[3];
    const asType = assign[4];
    const rhs = assign[5];
    if (!target || !rhs) return null;

    // Confirm the ternary is in the RHS portion, not in some part of the
    // target / `As` clause (defensive — the regex normally won't allow it).
    const rhsStart = cleanLine.lastIndexOf(rhs);
    if (rhsStart < 0 || ternary.questionAt < rhsStart) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "ternary-context-unsupported",
            line: context.lineIdx,
            column: ternary.questionAt,
            typeName: "non-assignment",
          },
        ],
      };
    }

    // Slice the ternary parts out of the RHS using offsets relative to the
    // cleanLine, which we already know matches the rawLine column-for-column
    // up to the trailing comment (handled separately).
    const cond = cleanLine.slice(rhsStart, ternary.questionAt).trim();
    const a = cleanLine.slice(ternary.questionAt + 1, ternary.colonAt).trim();
    const b = cleanLine.slice(ternary.colonAt + 1).trim();
    if (!cond || !a || !b) return null;

    const innerIndent = indent + "   ";
    const trailingComment = extractTrailingComment(rawLine);
    const out: string[] = [];

    // Emit the `Dim` declaration separately so the `If/Then/Else` block can
    // assign to a bare identifier on both branches.
    if (dimKeyword) {
      out.push(
        asType
          ? `${indent}${dimKeyword} ${target} As ${asType}`
          : `${indent}${dimKeyword} ${target}`,
      );
    }

    const ifHeader = `${indent}If ${cond} Then`;
    out.push(trailingComment ? `${ifHeader} ${trailingComment}` : ifHeader);
    out.push(`${innerIndent}${target} = ${a}`);
    out.push(`${indent}Else`);
    out.push(`${innerIndent}${target} = ${b}`);
    out.push(`${indent}End If`);

    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Inline transforms — token-level rewrites that run BEFORE the line-based
// rule registry. Use when a sugar can appear at any column inside a line
// (e.g. string interpolation `$"..."`) rather than as a whole-line trigger.
// ---------------------------------------------------------------------------

/**
 * Result of applying an inline transform to a single source line.
 *
 * `line` is the (possibly mutated) line text. `diagnostics[].line` should be
 * left as `0` by the implementation — the dispatcher rewrites it to the
 * actual source line index before forwarding to the caller.
 */
interface InlineTransformResult {
  readonly line: string;
  readonly diagnostics: readonly SugarDiagnostic[];
}

/**
 * Contract for an inline transform — a per-line, token-level rewriter that
 * has access to the entire line (rather than the comment-stripped form).
 * Implementations must be pure and idempotent: running them twice produces
 * the same result.
 */
interface InlineTransform {
  readonly name: string;
  apply(line: string): InlineTransformResult;
}

/**
 * String-interpolation rewriter: delegates to the shared {@link parseInterpolation}
 * helper in `src/utils/` so the live linter and the build-time transpiler
 * stay byte-identical (the linter cannot import from `src/project/` per the
 * fences in `governance.mdc`, hence the shared leaf module).
 *
 * Edge cases producing a diagnostic + leaving the token untouched:
 *  - `unterminated-string`: `$"abc` (no closing `"`).
 *  - `unterminated-brace`:  `$"foo {bar`.
 *  - `empty-expression`:    `$"foo {} bar"`.
 *
 * The scanner respects regular `"..."` strings and `'` line comments — a
 * `$"x{y}"` inside a comment or inside a regular string is left untouched.
 */
const interpolationTransform: InlineTransform = {
  name: "interpolation",
  apply(line) {
    const result = parseInterpolation(line);
    if (result.diagnostics.length === 0) {
      return { line: result.line, diagnostics: [] };
    }
    return {
      line: result.line,
      diagnostics: result.diagnostics.map((d) => ({
        code: "invalid-interpolation",
        // The dispatcher rewrites `line` to the source line index later.
        line: 0,
        column: d.column,
        typeName: d.reason,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// SugarTranspiler — registry-driven dispatcher
// ---------------------------------------------------------------------------

/**
 * Expands every registered sugar in a `.bas` source into the native form
 * supported by the Data7 compiler. Operates line-by-line and never crosses
 * into a multi-line transformation; rules that need cross-line context
 * (`Next`, etc.) leave those lines verbatim and rely on the fact that the
 * native expansion uses the same closing keyword.
 *
 * Adding a new sugar: implement {@link SugarRule}, append it to
 * {@link SugarTranspiler.RULES}. The dispatcher takes care of counters,
 * diagnostics aggregation and line-ending preservation. Tests for the new
 * sugar live in `src/test/project/transpiler.test.ts` (one `describe` per
 * rule) and a canonical example goes under `docs/exemple/sugar/<name>/`.
 */
export class SugarTranspiler {
  /**
   * Ordered list of sugars the transpiler knows. Order matters when two
   * rules could match the same line: the first match wins. `for-each-range`
   * is listed BEFORE `for-each` because both patterns match the
   * `For Each <var> In <expr>` shape — without the priority, the generic
   * rule would try to resolve `0..N` as an enumerable type and emit a
   * spurious `not-enumerable` warning. `ternary` is last because it scans
   * for a `?`/`:` pair anywhere in the line, which never collides with a
   * For Each header.
   */
  private static readonly RULES: readonly SugarRule[] = [
    forEachRangeSugarRule,
    forEachSugarRule,
    ternarySugarRule,
  ];

  /**
   * Inline transforms run BEFORE the line-based registry. Use these for
   * sugars that can appear at any column inside a line (e.g. string
   * interpolation tokens). The transpiler runs every transform on every
   * line in declaration order — so a later transform sees the output of
   * earlier ones. Today the only transform is `interpolation`.
   */
  private static readonly INLINE_TRANSFORMS: readonly InlineTransform[] = [interpolationTransform];

  public static transpile(code: string, ctx: TranspileContext): TranspileResult {
    const eol = code.includes("\r\n") ? "\r\n" : "\n";
    const lines = code.split(/\r?\n/);
    const output: string[] = [];
    const diagnostics: SugarDiagnostic[] = [];

    let srcCounter = 0;
    let idxCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      // `i < lines.length` guarantees the access; `?? ""` keeps the
      // `noUncheckedIndexedAccess` checker happy.
      let workingLine = lines[i] ?? "";

      // 1. Inline transforms (interpolation, …) — token-level rewrites.
      for (const transform of SugarTranspiler.INLINE_TRANSFORMS) {
        const result = transform.apply(workingLine);
        workingLine = result.line;
        for (const d of result.diagnostics) {
          diagnostics.push({ ...d, line: i });
        }
      }

      // 2. Line-based registry — first matching rule wins, may produce
      //    multi-line expansions.
      const cleanLine = DependencyScanner.stripComments(workingLine);

      const context: TranspileLineContext = {
        ctx,
        allLines: lines,
        lineIdx: i,
        freshIndex: () => `__idx${idxCounter++}`,
        freshSource: () => `__src${srcCounter++}`,
      };

      let matched = false;
      for (const rule of SugarTranspiler.RULES) {
        const result = rule.match(cleanLine, workingLine, context);
        if (result === null) continue;
        output.push(...result.replacement);
        if (result.diagnostics) diagnostics.push(...result.diagnostics);
        matched = true;
        break;
      }
      if (!matched) output.push(workingLine);
    }

    return { code: output.join(eol), diagnostics };
  }
}
