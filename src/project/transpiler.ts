import { DependencyScanner } from "../analysis/dependency-scanner";
import type { EnumerableInfo } from "../analysis/enumerable-detector";
import { parseInterpolation } from "../utils/interpolation";
import { findTopLevelTernary } from "../utils/ternary";
import { findTopLevelNullCoalesce } from "../utils/null-coalesce";
import { countOptionalChainTokens, findFirstOptionalChain } from "../utils/optional-chain";
import { parseArrayDestructure, parseObjectDestructure } from "../utils/destructure-parser";
import { runGenericsViaAST } from "./generics-driver";
import { runGenericsPass, type GenericsPassWarning } from "./generics-pass";

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
 *  - Generic codes (`unknown-template`, `generic-arity-mismatch`,
 *    `duplicate-template`, `class-generic-method-unsupported`,
 *    `flat-name-collision`, `instantiation-limit-exceeded`): `typeName`
 *    carries the template name (or flat name for collisions), and the
 *    `column` may be 0 when the warning is not tied to a specific token.
 */
export interface SugarDiagnostic {
  readonly code:
    | "not-enumerable"
    | "invalid-interpolation"
    | "ternary-context-unsupported"
    | "null-coalesce-context-unsupported"
    | "optional-chain-context-unsupported"
    | "optional-chain-too-deep"
    | "unknown-template"
    | "generic-arity-mismatch"
    | "duplicate-template"
    | "class-generic-method-unsupported"
    | "flat-name-collision"
    | "instantiation-limit-exceeded";
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
  /**
   * Experimental: when `true`, generics monomorphization runs via the
   * AST pipeline (`parse -> GenericsMonomorphizer -> serialize`)
   * instead of the legacy textual pre-pass. Controlled by
   * `data7.experimental.useAstGenerics`. Defaults to `false` when the
   * field is omitted so existing call sites keep working unchanged.
   */
  readonly useAstGenerics?: boolean;
}

/**
 * Maps a {@link GenericsPassWarning} to the unified {@link SugarDiagnostic}
 * stream. `typeName` is overloaded as a context payload:
 *
 *  - `unknown-template`, `duplicate-template`,
 *    `class-generic-method-unsupported`: carries the template name.
 *  - `generic-arity-mismatch`: encodes `"<name> expected=<n> actual=<m>"`.
 *  - `flat-name-collision`: carries the colliding flat name.
 *  - `instantiation-limit-exceeded`: empty string (the warning has no
 *    source location).
 */
function mapGenericsWarning(warning: GenericsPassWarning): SugarDiagnostic {
  let typeName: string;
  if (warning.code === "generic-arity-mismatch") {
    typeName = `${warning.templateName ?? ""} expected=${String(warning.expected ?? 0)} actual=${String(warning.actual ?? 0)}`;
  } else if (warning.code === "flat-name-collision") {
    typeName = warning.flatName ?? "";
  } else {
    typeName = warning.templateName ?? "";
  }
  return {
    code: warning.code,
    line: warning.line ?? 0,
    column: warning.column ?? 0,
    typeName,
  };
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

/**
 * Multi-line rule: consumes a contiguous range of lines starting at
 * `lineIdx` and emits the expanded form. Used for sugars whose body
 * spans multiple lines (`Using ... End Using`, `Enum X ... End Enum`,
 * `Match ... End Match`).
 *
 * `match` should return `null` when the opening line does not match the
 * pattern. Otherwise it consumes lines up to and including the matching
 * terminator (e.g. `End Using`) and returns the expansion + the
 * 0-based index of the LAST line consumed (so the dispatcher knows where
 * to resume).
 */
export interface MultiLineSugarRule {
  readonly name: string;
  match(
    rawLine: string,
    lines: readonly string[],
    lineIdx: number,
    context: TranspileLineContext,
  ): MultiLineSugarMatchResult | null;
}

export interface MultiLineSugarMatchResult {
  readonly replacement: readonly string[];
  /** 0-based index of the LAST consumed line (inclusive). */
  readonly endLineIdx: number;
  readonly diagnostics?: readonly SugarDiagnostic[];
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
// Built-in rule: `Dim x [As T] = New T() With { .X = v, ... }` (object init)
// ---------------------------------------------------------------------------

/** Matches `Dim x [As T] = New T(args) With { ... }` and reassignments. */
const OBJECT_INIT_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:As\s+([\w.]+)\s*)?=\s*(New\s+[\w.]+\s*\(.*?\))\s+With\s*\{\s*(.+?)\s*\}\s*$/i;

/**
 * Expands `Dim x = New T() With { .X = 1, .Y = 2 }` into the canonical
 * multi-line `Dim` + `With` block that Data7 already supports natively.
 *
 * Two surfaces:
 *
 *  - With `Dim` keyword: emits a `Dim <target>` then `<target> = New T()`
 *    then assignments inside `With`.
 *  - Without `Dim` (`obj.prop = New T() With { ... }`): emits only the
 *    assignment and the `With` block.
 *
 * Falls through (returns `null`) when the line does not match the regex,
 * so plain `New T()` calls and ternary RHS continue down the pipeline.
 */
const objectInitSugarRule: SugarRule = {
  name: "object-init",
  match(cleanLine, rawLine, _context) {
    const m = OBJECT_INIT_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const dimKeyword = m[2];
    const target = m[3];
    const asType = m[4];
    const newExpr = m[5];
    const initList = m[6] ?? "";
    if (!target || !newExpr) return null;

    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = indent + "   ";
    const out: string[] = [];

    const assignmentLine = dimKeyword
      ? asType
        ? `${indent}${dimKeyword} ${target} As ${asType} = ${newExpr}`
        : `${indent}${dimKeyword} ${target} = ${newExpr}`
      : `${indent}${target} = ${newExpr}`;
    out.push(trailingComment ? `${assignmentLine} ${trailingComment}` : assignmentLine);

    // Parse `.X = v, .Y = w, ...` initializer list, splitting on top-level
    // commas (respecting strings + parens).
    const inits = splitInitializerList(initList);
    out.push(`${indent}With ${target}`);
    for (const init of inits) {
      out.push(`${innerIndent}${init}`);
    }
    out.push(`${indent}End With`);

    return { replacement: out };
  },
};

/**
 * Splits an initializer list `.X = v, .Y = w` into discrete lines. Respects
 * string literals and parenthesis nesting so a comma inside a method call
 * (`.X = Foo(1, 2)`) is not treated as a separator.
 */
function splitInitializerList(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] ?? "";
    if (c === '"') {
      if (inString && raw[i + 1] === '"') {
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
      const segment = raw.slice(start, i).trim();
      if (segment) parts.push(segment);
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

// ---------------------------------------------------------------------------
// Built-in rule: `<obj>?.<member>` (optional chaining)
// ---------------------------------------------------------------------------

/** Maximum number of `?.` tokens supported per line. */
const OPTIONAL_CHAIN_MAX_DEPTH = 3;

/**
 * Matches an assignment whose RHS may use `?.` chaining:
 *   `<dim?> <target> [As <T>]? = <obj>?.<member>[(args)][.<more>]*`
 *
 * The base group captures the part BEFORE the first `?.`. We then expand
 * the line to a single `If <base> <> NULL Then` guard that wraps the
 * native chain.
 */
const OPTIONAL_CHAIN_ASSIGN_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:As\s+([\w.]+)\s*)?=\s*(.+)$/i;

/**
 * Matches a standalone call statement starting with an identifier and using
 * optional chaining: `<obj>?.Method(args)`. Used to expand
 * `me._pipe.Grouper?.Free()` into the `If me._pipe.Grouper <> NULL Then …`
 * guard form.
 */
const OPTIONAL_CHAIN_CALL_STATEMENT_REGEX =
  /^(\s*)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\?(\.[A-Za-z_]\w*\s*\(.*\))\s*$/;

/**
 * Expands `?.` (single-level + shallow chain) into native `If <obj> <> NULL Then …`.
 *
 * Two surfaces are supported:
 *
 *  1. Assignment RHS — `Dim x = obj?.Prop` becomes
 *
 *     ```
 *     Dim x
 *     If obj <> NULL Then
 *        x = obj.Prop
 *     End If
 *     ```
 *
 *  2. Call statement — `obj?.Method(args)` becomes
 *
 *     ```
 *     If obj <> NULL Then
 *        obj.Method(args)
 *     End If
 *     ```
 *
 * Anything else (`Print obj?.Prop`, `Return obj?.Prop`) emits
 * `optional-chain-context-unsupported`. Lines with more than three `?.`
 * tokens emit `optional-chain-too-deep` and are preserved verbatim.
 */
const optionalChainSugarRule: SugarRule = {
  name: "optional-chain",
  match(cleanLine, rawLine, context) {
    const firstOp = findFirstOptionalChain(cleanLine);
    if (!firstOp) return null;

    const depth = countOptionalChainTokens(cleanLine);
    if (depth > OPTIONAL_CHAIN_MAX_DEPTH) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "optional-chain-too-deep",
            line: context.lineIdx,
            column: firstOp.opAt,
            typeName: String(depth),
          },
        ],
      };
    }

    const trailingComment = extractTrailingComment(rawLine);

    // Surface 1 — call statement form `obj?.Method(args)`.
    const callMatch = OPTIONAL_CHAIN_CALL_STATEMENT_REGEX.exec(cleanLine);
    if (callMatch) {
      const indent = callMatch[1] ?? "";
      const base = callMatch[2];
      const tail = callMatch[3];
      if (!base || !tail) return null;
      const native = stripOptionalChainTokens(`${base}${tail}`);
      const innerIndent = indent + "   ";
      const out: string[] = [];
      const head = `${indent}If ${base} <> NULL Then`;
      out.push(trailingComment ? `${head} ${trailingComment}` : head);
      out.push(`${innerIndent}${native}`);
      out.push(`${indent}End If`);
      return { replacement: out };
    }

    // Surface 2 — assignment RHS.
    const assign = OPTIONAL_CHAIN_ASSIGN_REGEX.exec(cleanLine);
    if (!assign) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "optional-chain-context-unsupported",
            line: context.lineIdx,
            column: firstOp.opAt,
            typeName: "non-assignment-non-call",
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

    // Locate base (everything before the first `?.`) within the RHS.
    const rhsStart = cleanLine.lastIndexOf(rhs);
    if (rhsStart < 0 || firstOp.opAt < rhsStart) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "optional-chain-context-unsupported",
            line: context.lineIdx,
            column: firstOp.opAt,
            typeName: "non-assignment-non-call",
          },
        ],
      };
    }

    const base = cleanLine.slice(rhsStart, firstOp.opAt).trim();
    if (!base) return null;
    const native = stripOptionalChainTokens(rhs);
    const innerIndent = indent + "   ";
    const out: string[] = [];

    if (dimKeyword) {
      out.push(
        asType
          ? `${indent}${dimKeyword} ${target} As ${asType}`
          : `${indent}${dimKeyword} ${target}`,
      );
    }
    const head = `${indent}If ${base} <> NULL Then`;
    out.push(trailingComment ? `${head} ${trailingComment}` : head);
    out.push(`${innerIndent}${target} = ${native}`);
    out.push(`${indent}End If`);

    return { replacement: out };
  },
};

/**
 * Strips every `?.` from `expr`, leaving `.` in place. Used by the optional
 * chain expansion so the result is a plain `obj.Member.Sub.Method(args)`.
 */
function stripOptionalChainTokens(expr: string): string {
  return expr.replace(/\?\./g, ".");
}

// ---------------------------------------------------------------------------
// Built-in rule: `Return If cond Then a Else b` (early return inline)
// ---------------------------------------------------------------------------

const RETURN_IF_REGEX = /^(\s*)Return\s+If\s+(.+?)\s+Then\s+(.+?)\s+Else\s+(.+)$/i;

/**
 * Expands `Return If cond Then a Else b` into the canonical multi-line
 * shape `If cond Then Return a / Return b`. Useful when the body of a
 * `Function` boils down to a single conditional return.
 */
const returnIfSugarRule: SugarRule = {
  name: "return-if",
  match(cleanLine, rawLine, _context) {
    const m = RETURN_IF_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const cond = (m[2] ?? "").trim();
    const a = (m[3] ?? "").trim();
    const b = (m[4] ?? "").trim();
    if (!cond || !a || !b) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const head = `${indent}If ${cond} Then Return ${a}`;
    const out: string[] = [];
    out.push(trailingComment ? `${head} ${trailingComment}` : head);
    out.push(`${indent}Return ${b}`);
    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `Dim { Nome, Idade } = obj` (object destructuring)
// ---------------------------------------------------------------------------

const DESTRUCTURE_OBJECT_REGEX = /^(\s*)Dim\s*\{\s*([^}]+?)\s*\}\s*=\s*(.+)$/i;

/**
 * Expands `Dim { Nome, Idade } = pessoa` into a sequence of `Dim` lines,
 * one per binding. Supports rename (`Nome As n`) and default values
 * (`Nome As n = "x"`).
 */
const destructureObjectSugarRule: SugarRule = {
  name: "destructure-object",
  match(cleanLine, rawLine, _context) {
    const m = DESTRUCTURE_OBJECT_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const body = m[2] ?? "";
    const source = (m[3] ?? "").trim();
    if (!source) return null;
    const bindings = parseObjectDestructure(body);
    if (!bindings) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const out: string[] = [];
    bindings.forEach((b, idx) => {
      const dim = `${indent}Dim ${b.local} = ${source}.${b.member}`;
      out.push(idx === 0 && trailingComment ? `${dim} ${trailingComment}` : dim);
      if (b.defaultExpr !== undefined) {
        out.push(
          `${indent}If ${b.local} = NULL Or ${b.local} = "" Then ${b.local} = ${b.defaultExpr}`,
        );
      }
    });
    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `Dim [first, second, ...rest] = lista` (array destructuring)
// ---------------------------------------------------------------------------

const DESTRUCTURE_ARRAY_REGEX = /^(\s*)Dim\s*\[\s*([^\]]+?)\s*\]\s*=\s*(.+)$/i;

/**
 * Expands `Dim [a, b] = lista` into `Dim a = lista.Item(0) / Dim b = lista.Item(1)`.
 * The optional rest binding `[a, ...rest]` produces a Dim for the first
 * element plus a loop that gathers the tail into a fresh `TList`.
 *
 * Uses `.Item(i)` as the canonical indexer name (matches the default
 * indexer convention documented in 10-acucares-atuais.md § C5).
 */
const destructureArraySugarRule: SugarRule = {
  name: "destructure-array",
  match(cleanLine, rawLine, context) {
    const m = DESTRUCTURE_ARRAY_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const body = m[2] ?? "";
    const source = (m[3] ?? "").trim();
    if (!source) return null;
    const bindings = parseArrayDestructure(body);
    if (!bindings) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const out: string[] = [];
    bindings.forEach((b, idx) => {
      if (b.isRest) {
        const restList = context.freshSource();
        out.push(`${indent}Dim ${b.local} As StringList = New StringList()`);
        out.push(`${indent}For ${restList} = ${idx} To ${source}.Count - 1`);
        out.push(`${indent}   ${b.local}.Add(${source}.Item(${restList}))`);
        out.push(`${indent}Next`);
      } else {
        const dim = `${indent}Dim ${b.local} = ${source}.Item(${idx})`;
        out.push(idx === 0 && trailingComment ? `${dim} ${trailingComment}` : dim);
      }
    });
    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `Dim x As New T` (auto-new without `()`)
// ---------------------------------------------------------------------------

/**
 * Matches `Dim x As New T` WITHOUT the trailing `()`. This shape is used
 * by the auto-new sugar that gives Data7 a "free" default construction.
 *
 * Generic usages (`Dim x As New TList<Product>`) reach this rule AFTER
 * `generics-pass` has already rewritten them to flat names — so by the
 * time we look, `<Product>` is gone and the regex only sees `TList_Product`.
 */
const AUTO_NEW_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*)\s+As\s+New\s+([\w.]+)\s*$/i;

const autoNewSugarRule: SugarRule = {
  name: "auto-new",
  match(cleanLine, rawLine, _context) {
    const m = AUTO_NEW_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const dimKeyword = m[2] ?? "Dim";
    const target = m[3];
    const typeName = m[4];
    if (!target || !typeName) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const head = `${indent}${dimKeyword} ${target} As ${typeName} = New ${typeName}()`;
    return { replacement: [trailingComment ? `${head} ${trailingComment}` : head] };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `<lhs> [As <T>] = <a> ?? <b>` (null-coalescing in assignment)
// ---------------------------------------------------------------------------

/**
 * Matches `<lhs>[ As <T>] = <rhs>` so the `nullCoalesceSugarRule` below can
 * isolate the RHS and split it at the top-level `??`. Same regex shape used
 * by the ternary rule but with no ternary-specific groups — we delegate the
 * `??` location to {@link findTopLevelNullCoalesce}.
 */
const NULL_COALESCE_ASSIGN_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:As\s+([\w.]+)\s*)?=\s*(.+)$/i;

/**
 * Expands a null-coalescing `a ?? b` on the RHS of an assignment into the
 * native multi-line `If a = NULL Then x = b Else x = a / End If` form.
 *
 * Conservative materialisation: when the LHS of the `??` is a complex
 * expression (anything other than a bare identifier or a simple
 * `obj.prop` chain), it is lifted into a `__coalesceN` temp so the
 * expression is evaluated only once.
 *
 * Same context restrictions as the ternary rule: only assignment RHS is
 * supported. `Return x ?? y`, `Print x ?? y` and `Foo(x ?? y)` emit the
 * `null-coalesce-context-unsupported` diagnostic.
 */
const nullCoalesceSugarRule: SugarRule = {
  name: "null-coalesce",
  match(cleanLine, rawLine, context) {
    const op = findTopLevelNullCoalesce(cleanLine);
    if (!op) return null;

    const assign = NULL_COALESCE_ASSIGN_REGEX.exec(cleanLine);
    if (!assign) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "null-coalesce-context-unsupported",
            line: context.lineIdx,
            column: op.opAt,
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

    const rhsStart = cleanLine.lastIndexOf(rhs);
    if (rhsStart < 0 || op.opAt < rhsStart) {
      return {
        replacement: [rawLine],
        diagnostics: [
          {
            code: "null-coalesce-context-unsupported",
            line: context.lineIdx,
            column: op.opAt,
            typeName: "non-assignment",
          },
        ],
      };
    }

    const lhsExpr = cleanLine.slice(rhsStart, op.opAt).trim();
    const rhsExpr = cleanLine.slice(op.opAt + 2).trim();
    if (!lhsExpr || !rhsExpr) return null;

    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = indent + "   ";
    const out: string[] = [];

    if (dimKeyword) {
      out.push(
        asType
          ? `${indent}${dimKeyword} ${target} As ${asType}`
          : `${indent}${dimKeyword} ${target}`,
      );
    }

    const needsTemp = isComplexExpression(lhsExpr);
    const lhsRef = needsTemp ? context.freshSource() : lhsExpr;
    if (needsTemp) {
      out.push(`${indent}Dim ${lhsRef} = ${lhsExpr}`);
    }

    const ifHeader = `${indent}If ${lhsRef} = NULL Then`;
    out.push(trailingComment ? `${ifHeader} ${trailingComment}` : ifHeader);
    out.push(`${innerIndent}${target} = ${rhsExpr}`);
    out.push(`${indent}Else`);
    out.push(`${innerIndent}${target} = ${lhsRef}`);
    out.push(`${indent}End If`);

    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `<lhs> ??= <rhs>` (logical assignment — null-coalescing)
// ---------------------------------------------------------------------------

/**
 * Matches a single-line compound assignment `<lhs> ??= <expr>` and expands
 * to `If <lhs> = NULL Then <lhs> = <expr>`. The LHS supports identifiers
 * and dotted member access (`obj.prop`) — anything else is ignored so the
 * caller falls through to the next rule.
 */
const COALESCE_ASSIGN_REGEX = /^(\s*)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\?\?=\s*(.+)$/i;

const coalesceAssignSugarRule: SugarRule = {
  name: "coalesce-assign",
  match(cleanLine, rawLine, _context) {
    const m = COALESCE_ASSIGN_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const target = m[2];
    const rhs = m[3];
    if (!target || !rhs) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = indent + "   ";
    const out: string[] = [];
    const head = `${indent}If ${target} = NULL Then`;
    out.push(trailingComment ? `${head} ${trailingComment}` : head);
    out.push(`${innerIndent}${target} = ${rhs.trim()}`);
    out.push(`${indent}End If`);
    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Built-in rule: `<lhs> ||= <rhs>` and `<lhs> &&= <rhs>` (logical assignment)
// ---------------------------------------------------------------------------

const LOGICAL_OR_ASSIGN_REGEX = /^(\s*)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\|\|=\s*(.+)$/i;
const LOGICAL_AND_ASSIGN_REGEX = /^(\s*)([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*&&=\s*(.+)$/i;

/**
 * `x ||= y` → `If Not x Then x = y / End If`. Mirrors TypeScript / C#
 * logical-or assignment. The semantics use Basic's `Not` operator on the
 * LHS; if the LHS is non-Boolean, the runtime coerces the same way as
 * `If x Then ...` already does.
 */
const logicalOrAssignSugarRule: SugarRule = {
  name: "logical-or-assign",
  match(cleanLine, rawLine, _context) {
    const m = LOGICAL_OR_ASSIGN_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const target = m[2];
    const rhs = m[3];
    if (!target || !rhs) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = indent + "   ";
    const out: string[] = [];
    const head = `${indent}If Not ${target} Then`;
    out.push(trailingComment ? `${head} ${trailingComment}` : head);
    out.push(`${innerIndent}${target} = ${rhs.trim()}`);
    out.push(`${indent}End If`);
    return { replacement: out };
  },
};

/**
 * `x &&= y` → `If x Then x = y / End If`. The dual of `||=` above.
 */
const logicalAndAssignSugarRule: SugarRule = {
  name: "logical-and-assign",
  match(cleanLine, rawLine, _context) {
    const m = LOGICAL_AND_ASSIGN_REGEX.exec(cleanLine);
    if (!m) return null;
    const indent = m[1] ?? "";
    const target = m[2];
    const rhs = m[3];
    if (!target || !rhs) return null;
    const trailingComment = extractTrailingComment(rawLine);
    const innerIndent = indent + "   ";
    const out: string[] = [];
    const head = `${indent}If ${target} Then`;
    out.push(trailingComment ? `${head} ${trailingComment}` : head);
    out.push(`${innerIndent}${target} = ${rhs.trim()}`);
    out.push(`${indent}End If`);
    return { replacement: out };
  },
};

// ---------------------------------------------------------------------------
// Multi-line rules — consume a range of lines and emit a multi-line block.
// ---------------------------------------------------------------------------

const USING_HEADER_REGEX =
  /^(\s*)Using\s+([A-Za-z_]\w*)\s+As\s+(?:New\s+)?([\w.]+)\s*(?:\((.*)\))?\s*$/i;

/**
 * Expands a `Using x As New T(args) / ... / End Using` block into the
 * native `Try / ... / Finally / x.Free() / End Try` form.
 *
 * The Data7 ERP idiom for resource liberation is `Free()` (vide
 * `docs/linguagem-basic/05-classes.md`). The `Using` sugar provides the
 * same RAII guarantee with one less level of indentation than writing the
 * `Try/Finally` block by hand.
 */
const usingMultiLineRule: MultiLineSugarRule = {
  name: "using",
  match(rawLine, lines, lineIdx, _context) {
    const m = USING_HEADER_REGEX.exec(DependencyScanner.stripComments(rawLine));
    if (!m) return null;
    const indent = m[1] ?? "";
    const target = m[2];
    const typeName = m[3];
    const args = m[4] ?? "";
    if (!target || !typeName) return null;

    // Find the matching `End Using` at the same (or smaller) indentation.
    let endIdx = -1;
    for (let j = lineIdx + 1; j < lines.length; j++) {
      const ln = lines[j] ?? "";
      if (/^\s*End\s+Using\b/i.test(ln)) {
        endIdx = j;
        break;
      }
    }
    if (endIdx < 0) {
      // Unterminated — leave the line verbatim.
      return null;
    }

    const innerIndent = indent + "   ";
    const inner: string[] = [];
    inner.push(`${indent}Dim ${target} As ${typeName} = New ${typeName}(${args})`);
    inner.push(`${indent}Try`);
    for (let j = lineIdx + 1; j < endIdx; j++) {
      const ln = lines[j] ?? "";
      // Re-indent body content by one level (the `Try` block adds nesting).
      inner.push(`   ${ln}`);
    }
    inner.push(`${indent}Finally`);
    inner.push(`${innerIndent}${target}.Free()`);
    inner.push(`${indent}End Try`);

    return { replacement: inner, endLineIdx: endIdx };
  },
};

const MATCH_HEADER_REGEX = /^(\s*)Match\s+(.+?)\s*$/i;

/**
 * Expands `Match x / Case Is TFoo : <stmt> / Case Else : <stmt> / End Match`
 * into the canonical `If x.InheritsFrom(TFoo) Then <stmt> / ElseIf ... /
 * Else <stmt> / End If` form.
 *
 * Each `Case Is <Type>` line is an `InheritsFrom` check; `Case Else` lands
 * in the trailing `Else` branch. The body of each case (everything after
 * the `:` separator) is emitted in a single line — multi-line bodies must
 * be refactored to a helper sub.
 */
const matchMultiLineRule: MultiLineSugarRule = {
  name: "match",
  match(rawLine, lines, lineIdx, _context) {
    const m = MATCH_HEADER_REGEX.exec(DependencyScanner.stripComments(rawLine));
    if (!m) return null;
    const indent = m[1] ?? "";
    const subject = (m[2] ?? "").trim();
    if (!subject) return null;

    let endIdx = -1;
    const cases: { test?: string; body: string }[] = [];
    for (let j = lineIdx + 1; j < lines.length; j++) {
      const ln = lines[j] ?? "";
      const clean = DependencyScanner.stripComments(ln).trim();
      if (!clean) continue;
      if (/^End\s+Match\b/i.test(clean)) {
        endIdx = j;
        break;
      }
      const caseElse = /^Case\s+Else\s*:?\s*(.*)$/i.exec(clean);
      if (caseElse) {
        cases.push({ body: (caseElse[1] ?? "").trim() });
        continue;
      }
      const caseIs = /^Case\s+Is\s+([\w.]+)\s*:?\s*(.*)$/i.exec(clean);
      if (caseIs) {
        cases.push({ test: caseIs[1] ?? "", body: (caseIs[2] ?? "").trim() });
        continue;
      }
    }
    if (endIdx < 0 || cases.length === 0) return null;

    const innerIndent = indent + "   ";
    const out: string[] = [];
    let first = true;
    let elseEmitted = false;
    for (const c of cases) {
      if (c.test) {
        const header = first
          ? `${indent}If ${subject}.InheritsFrom(${c.test}) Then`
          : `${indent}ElseIf ${subject}.InheritsFrom(${c.test}) Then`;
        out.push(header);
        if (c.body) out.push(`${innerIndent}${c.body}`);
        first = false;
      } else {
        out.push(`${indent}Else`);
        if (c.body) out.push(`${innerIndent}${c.body}`);
        elseEmitted = true;
      }
    }
    if (!first) out.push(`${indent}End If`);

    void elseEmitted;
    return { replacement: out, endLineIdx: endIdx };
  },
};

const ENUM_HEADER_REGEX = /^(\s*)Enum\s+([A-Za-z_]\w*)(?:\s+As\s+BaseEnum)?\s*$/i;

/**
 * Expands a declarative `Enum X / V1 = "n1" / V2 = "n2" / End Enum` block
 * into the BaseEnum pattern used by real Data7 code (see
 * `docs/linguagem-basic/12-convencoes-idiomaticas.md` for the canonical
 * shape). Each value declared inside becomes a `Shared Function <name>`
 * factory plus an entry registered in `Initialize`.
 */
const enumMultiLineRule: MultiLineSugarRule = {
  name: "enum-declarative",
  match(rawLine, lines, lineIdx, _context) {
    const m = ENUM_HEADER_REGEX.exec(DependencyScanner.stripComments(rawLine));
    if (!m) return null;
    const indent = m[1] ?? "";
    const enumName = m[2];
    if (!enumName) return null;

    let endIdx = -1;
    const entries: { name: string; value: string }[] = [];
    for (let j = lineIdx + 1; j < lines.length; j++) {
      const ln = lines[j] ?? "";
      const clean = DependencyScanner.stripComments(ln).trim();
      if (!clean) continue;
      if (/^End\s+Enum\b/i.test(clean)) {
        endIdx = j;
        break;
      }
      const e = /^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/.exec(clean);
      if (e) {
        const name = e[1] ?? "";
        const value = (e[2] ?? `"${name}"`).trim();
        if (name) entries.push({ name, value });
      }
    }
    if (endIdx < 0 || entries.length === 0) return null;

    const innerIndent = indent + "   ";
    const out: string[] = [];
    out.push(`${indent}Class ${enumName}`);
    out.push(`${innerIndent}Inherits BaseEnum`);
    out.push("");
    out.push(`${innerIndent}Private Shared _Initialized As Boolean`);
    out.push("");
    out.push(`${innerIndent}Private Shared Sub Initialize()`);
    out.push(`${innerIndent}   If _Initialized Then Exit Sub`);
    entries.forEach((entry, idx) => {
      out.push(
        `${innerIndent}   BaseEnum._AddEnumItem("${enumName}", New ${enumName}(${idx}, ${entry.value}))`,
      );
    });
    out.push(`${innerIndent}   _Initialized = True`);
    out.push(`${innerIndent}End Sub`);
    for (const entry of entries) {
      out.push("");
      out.push(`${innerIndent}Shared Function ${entry.name} As ${enumName}`);
      out.push(`${innerIndent}   ${entry.name} = Load(${entry.value})`);
      out.push(`${innerIndent}End Function`);
    }
    out.push("");
    out.push(`${innerIndent}Shared Function Load(pValue As String) As ${enumName}`);
    out.push(`${innerIndent}   ${enumName}.Initialize()`);
    out.push(
      `${innerIndent}   Load = CType(BaseEnum._GetCache("${enumName}", pValue), ${enumName})`,
    );
    out.push(`${innerIndent}End Function`);
    out.push("");
    out.push(`${innerIndent}Shared Function GetOptions() As String`);
    out.push(`${innerIndent}   ${enumName}.Initialize()`);
    out.push(`${innerIndent}   GetOptions = BaseEnum._GetEnumOptions("${enumName}")`);
    out.push(`${innerIndent}End Function`);
    out.push(`${indent}End Class`);

    return { replacement: out, endLineIdx: endIdx };
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

/**
 * Numeric separator rewriter — strips `_` between digits in number literals
 * so `1_000_000` becomes `1000000`. Operates only on digit-underscore-digit
 * sequences, leaving identifiers (`__src0`) and strings ("a_b") untouched.
 *
 * Pure token-level pass with no diagnostics; included as an InlineTransform
 * because it can appear at any column.
 */
const numericSeparatorTransform: InlineTransform = {
  name: "numeric-separator",
  apply(line) {
    if (!line.includes("_")) return { line, diagnostics: [] };

    let out = "";
    let i = 0;
    while (i < line.length) {
      const c = line[i] ?? "";

      // Skip line comment verbatim.
      if (c === "'") {
        out += line.substring(i);
        break;
      }

      // Skip a `"..."` string literal verbatim (with `""` escape).
      if (c === '"') {
        out += '"';
        i++;
        while (i < line.length) {
          const cc = line[i] ?? "";
          if (cc === '"') {
            if (line[i + 1] === '"') {
              out += '""';
              i += 2;
              continue;
            }
            out += '"';
            i++;
            break;
          }
          out += cc;
          i++;
        }
        continue;
      }

      // Skip `$"..."` token verbatim too (the interpolation transform may
      // have already expanded them, but if not, we should not touch their
      // content).
      if (c === "$" && line[i + 1] === '"') {
        out += '$"';
        i += 2;
        while (i < line.length) {
          const cc = line[i] ?? "";
          if (cc === '"') {
            if (line[i + 1] === '"') {
              out += '""';
              i += 2;
              continue;
            }
            out += '"';
            i++;
            break;
          }
          out += cc;
          i++;
        }
        continue;
      }

      // Numeric literal: only strip `_` when it sits BETWEEN two digits.
      // The literal must START with a digit (not be preceded by an
      // identifier char) so `__src0` is left alone.
      if (c >= "0" && c <= "9" && !isIdentChar(line[i - 1])) {
        // Consume the literal.
        let j = i;
        while (j < line.length) {
          const cj = line[j] ?? "";
          if ((cj >= "0" && cj <= "9") || cj === "." || cj === "e" || cj === "E") {
            j++;
            continue;
          }
          if (cj === "_" && isDigit(line[j - 1]) && isDigit(line[j + 1])) {
            j++;
            continue;
          }
          break;
        }
        out += line.substring(i, j).replace(/_/g, "");
        i = j;
        continue;
      }

      out += c;
      i++;
    }
    return { line: out, diagnostics: [] };
  },
};

function isIdentChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  return ch >= "0" && ch <= "9";
}

/**
 * Pipe operator `|>` rewriter:
 *
 *  `Dim r = data |> Trim |> ToUpper`
 *
 * becomes
 *
 *  `Dim r = ToUpper(Trim(data))`
 *
 * Implemented as an inline transform so it runs before the line-based
 * rules — any subsequent rule that operates on the line sees only the
 * native nested-call form.
 *
 * The operator is left-associative. Each `|>` after a left-hand
 * expression is treated as a function application: `lhs |> f` becomes
 * `f(lhs)`. A method-call `lhs |> obj.Method` becomes `obj.Method(lhs)`.
 */
const pipeTransform: InlineTransform = {
  name: "pipe",
  apply(line) {
    if (!line.includes("|>")) return { line, diagnostics: [] };
    // The pipe operator is only meaningful inside an EXPRESSION position —
    // typically the RHS of an assignment. We locate the last top-level `=`
    // (or the start of the line when there is none) and rewrite only the
    // text that follows it. This keeps `Dim r As String = ...` declarations
    // intact while still letting standalone-expression lines work.
    const eqPos = findTopLevelAssignmentEquals(line);
    const exprStart = eqPos === null ? 0 : eqPos + 1;
    const prefix = line.slice(0, exprStart);
    let expr = line.slice(exprStart);
    if (!expr.includes("|>")) return { line, diagnostics: [] };
    // Capture leading whitespace from the expression slice so we keep it.
    const exprIndentMatch = /^(\s*)/.exec(expr);
    const exprIndent = exprIndentMatch?.[1] ?? "";
    expr = expr.slice(exprIndent.length);

    let current = expr;
    for (let iter = 0; iter < 50; iter++) {
      const pos = findTopLevelPipe(current);
      if (pos === null) break;
      const before = current.slice(0, pos).trim();
      const after = current.slice(pos + 2).trim();
      const nextPipe = findTopLevelPipe(after);
      const fnExpr = nextPipe === null ? after : after.slice(0, nextPipe).trim();
      const remaining = nextPipe === null ? "" : after.slice(nextPipe);
      current = `${fnExpr}(${before})${remaining ? remaining : ""}`;
    }
    return { line: `${prefix}${exprIndent}${current}`, diagnostics: [] };
  },
};

/**
 * Returns the position of the top-level `=` assignment operator on `line`,
 * or `null` when no such operator is present. Skips occurrences inside
 * strings/parens, and IGNORES `==`, `<=`, `>=`, `<>` (which are not
 * assignments).
 */
function findTopLevelAssignmentEquals(line: string): number | null {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inString && line[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "'") return null;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && c === "=") {
      const prev = line[i - 1] ?? "";
      const next = line[i + 1] ?? "";
      // Skip `==` and the second char of `<=`, `>=`, `<>` patterns.
      if (next === "=" || prev === "<" || prev === ">" || prev === "=" || prev === "!") continue;
      return i;
    }
  }
  return null;
}

/**
 * Finds the position of the first top-level `|>` token in `s`, respecting
 * strings and parenthesis nesting. Returns `null` when not found.
 */
function findTopLevelPipe(s: string): number | null {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      if (inString && s[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "'") return null;
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && c === "|" && s[i + 1] === ">") return i;
  }
  return null;
}

/**
 * Tagged template transform — rewrites `tag$"text {expr}"` into
 * `tag.Build("text ", expr)`. Runs AFTER the regular interpolation pass
 * has already extracted the template fragments.
 *
 * Today we only special-case the leading `tag` identifier; the template
 * body still expands via {@link parseInterpolation} called by the
 * `interpolationTransform`, then we re-pack the pieces into a `Build` call.
 */
const taggedTemplateTransform: InlineTransform = {
  name: "tagged-template",
  apply(line) {
    if (!/[A-Za-z_]\w*\$"/.test(line)) return { line, diagnostics: [] };
    const out = line.replace(/([A-Za-z_]\w*)\$"([^"]*?)"/g, (_match, tag: string, body: string) => {
      // Body may contain `{expr}` segments; we split conservatively.
      const segments = body.split(/\{([^}]+)\}/g);
      const parts: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const piece = segments[i] ?? "";
        if (i % 2 === 0) {
          parts.push(`"${piece}"`);
        } else {
          parts.push(`(${piece.trim()})`);
        }
      }
      return `${tag}.Build(${parts.join(", ")})`;
    });
    return { line: out, diagnostics: [] };
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
    // Destructuring rules must run BEFORE the assignment-based rules so
    // their `Dim { ... } = obj` shape is consumed first (the regex used
    // by `nullCoalesceSugarRule` would partially match it otherwise).
    destructureObjectSugarRule,
    destructureArraySugarRule,
    // Object initializer must run BEFORE generic ternary / null-coalesce
    // rules because its RHS contains `New T(args) With { ... }` which
    // would otherwise be partially matched by the simpler assignment
    // patterns.
    objectInitSugarRule,
    // Auto-new (`Dim x As New T`) runs before compound assignments so a
    // line ending without `()` gets the explicit `= New T()` form.
    autoNewSugarRule,
    // Compound assignments (`??=`, `||=`, `&&=`) come BEFORE the
    // null-coalesce + ternary rules so the regex for `x ??= y` is matched
    // as a single token instead of `x ?? = y` (would never make sense, but
    // keeps the precedence explicit).
    coalesceAssignSugarRule,
    logicalOrAssignSugarRule,
    logicalAndAssignSugarRule,
    // Optional chaining `?.` runs BEFORE null-coalesce so a line like
    // `Dim x = obj?.Foo ?? "default"` gets the `?.` lift first (turning
    // `obj?.Foo` into a guarded block), and the resulting `__src` temp +
    // `??` are handled by subsequent passes.
    optionalChainSugarRule,
    nullCoalesceSugarRule,
    // `Return If cond Then a Else b` must run BEFORE the generic ternary
    // rule because the ternary regex would otherwise reach for the `?`
    // that the `If` form does not actually use — but we still place it
    // ahead defensively so the canonical shape is consumed first.
    returnIfSugarRule,
    ternarySugarRule,
  ];

  /**
   * Inline transforms run BEFORE the line-based registry. Use these for
   * sugars that can appear at any column inside a line (e.g. string
   * interpolation tokens). The transpiler runs every transform on every
   * line in declaration order — so a later transform sees the output of
   * earlier ones.
   *
   * Order matters: numeric separators run AFTER interpolation so digits
   * inside a `$"..."` token are preserved verbatim (the interpolation pass
   * already left them alone, but the explicit ordering is documented here).
   */
  private static readonly INLINE_TRANSFORMS: readonly InlineTransform[] = [
    // Tagged templates run FIRST so a `sql$"..."` token is rewritten into
    // a normal call BEFORE the interpolation transform tries to expand
    // the unsupported leading `tag` prefix.
    taggedTemplateTransform,
    interpolationTransform,
    numericSeparatorTransform,
    // Pipe transform runs after numeric separators so a `1_000 |> Foo`
    // is first stripped to `1000 |> Foo` and then to `Foo(1000)`.
    pipeTransform,
  ];

  /**
   * Multi-line rules run BEFORE the per-line registry on every header
   * line. When one matches, it consumes its full range (`Using ... End
   * Using`) and emits the expanded block; the dispatcher skips ahead to
   * the line after the consumed range.
   */
  private static readonly MULTI_LINE_RULES: readonly MultiLineSugarRule[] = [
    usingMultiLineRule,
    enumMultiLineRule,
    matchMultiLineRule,
  ];

  public static transpile(code: string, ctx: TranspileContext): TranspileResult {
    // Phase 0 — generics monomorphisation. Runs BEFORE inline
    // transforms and the rule registry so the rest of the pipeline
    // only ever sees flat names (`TList_Product`) instead of `<T>`
    // syntax that the Data7 compiler does not understand.
    //
    // When `ctx.useAstGenerics === true` the AST-based pipeline runs
    // (`parse -> GenericsMonomorphizer -> serialize`). Otherwise the
    // legacy textual regex pre-pass runs. Both return the same
    // {@link GenericsPassResult} shape; the rest of `transpile` is
    // unchanged either way.
    const useAst = ctx.useAstGenerics === true;
    const genericsResult = useAst ? runGenericsViaAST(code) : runGenericsPass(code);
    const monomorphic = genericsResult.code;

    const eol = monomorphic.includes("\r\n") ? "\r\n" : "\n";
    const lines = monomorphic.split(/\r?\n/);
    const output: string[] = [];
    const diagnostics: SugarDiagnostic[] = [];

    // Propagate generics-pass warnings to the SugarDiagnostic stream so
    // the Builder and the linter both surface them through a single
    // shape. The mapping is straightforward — `code` carries over,
    // `typeName` is overloaded as a "context" payload (template name,
    // flat name, or arity-mismatch summary).
    for (const warning of genericsResult.warnings) {
      diagnostics.push(mapGenericsWarning(warning));
    }

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

      const context: TranspileLineContext = {
        ctx,
        allLines: lines,
        lineIdx: i,
        freshIndex: () => `__idx${idxCounter++}`,
        freshSource: () => `__src${srcCounter++}`,
      };

      // 2. Multi-line rules — when one matches, it consumes a whole range
      //    of lines and we skip past the end of that range.
      let multiLineMatched = false;
      for (const rule of SugarTranspiler.MULTI_LINE_RULES) {
        const result = rule.match(workingLine, lines, i, context);
        if (result === null) continue;
        output.push(...result.replacement);
        if (result.diagnostics) diagnostics.push(...result.diagnostics);
        i = result.endLineIdx;
        multiLineMatched = true;
        break;
      }
      if (multiLineMatched) continue;

      // 3. Line-based registry — first matching rule wins, may produce
      //    multi-line expansions.
      const cleanLine = DependencyScanner.stripComments(workingLine);
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
