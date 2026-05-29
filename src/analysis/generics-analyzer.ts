/**
 * Lightweight, pure analyzer for the Data7 textual generics pre-pass.
 *
 * Mirrors the warning shape emitted by
 * `src/project/generics-pass.ts#runGenericsPass`, but skips the actual
 * monomorphic rewriting and worklist drain — so the linter can run the
 * analysis cheaply on every keystroke without paying for the full
 * instantiation pipeline.
 *
 * Lives in `src/analysis/` (not `src/project/`) so the diagnostics layer
 * (`src/diagnostics/diagnostics.ts`) can consume it without violating the
 * fences enforced by `eslint.config.mjs#diagnostics-isolation`. The
 * full builder uses `src/project/generics-pass.ts`, which re-exports the
 * warning types declared here.
 */

import { tokenize as tokenizeLine } from "../utils/bas-tokenizer";

/**
 * Stable warning codes emitted by the textual generics pre-pass. The
 * codes mirror the AST engine's `MonomorphizationWarningCode` so a future
 * migration to the AST driver can map them 1:1 without renaming.
 */
export type GenericsPassWarningCode =
  | "unknown-template"
  | "generic-arity-mismatch"
  | "duplicate-template"
  | "class-generic-method-unsupported"
  | "flat-name-collision"
  | "instantiation-limit-exceeded";

/**
 * One warning emitted by the textual generics pre-pass. Source location
 * is optional because some warnings (`instantiation-limit-exceeded`) are
 * not tied to a particular line.
 */
export interface GenericsPassWarning {
  readonly code: GenericsPassWarningCode;
  readonly message: string;
  /** Template name (original, non-flat). */
  readonly templateName?: string;
  /** Flat name when relevant (collision detection). */
  readonly flatName?: string;
  /** Expected type-parameter count for `generic-arity-mismatch`. */
  readonly expected?: number;
  /** Supplied type-argument count for `generic-arity-mismatch`. */
  readonly actual?: number;
  /** 0-based line index in the input source, when known. */
  readonly line?: number;
  /** 0-based column index of the offending token, when known. */
  readonly column?: number;
}

interface TemplateText {
  readonly kind: "class" | "delegate";
  readonly name: string;
  readonly typeParams: readonly string[];
  readonly body: readonly string[];
  /**
   * 0-based source line of the header. Populated by `registerTemplate`
   * so {@link collectGenericsContext} can expose it through
   * {@link GenericTemplateInfo}.
   */
  readonly line: number;
}

const CLASS_GENERIC_HEADER_REGEX = /^\s*Class\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*$/i;
const DELEGATE_GENERIC_HEADER_REGEX =
  /^\s*Delegate\s+(?:Sub|Function)\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*\(.*\)/i;

/**
 * A monomorphic instantiation observed in the source. Mirrors what the
 * textual pre-pass and the AST monomorphizer would emit, but stops at
 * the "(template, type-args) -> flat name" mapping — the caller decides
 * how to consume it (linter warning, IntelliSense flat-symbol synthesis,
 * etc.).
 *
 * `typeArgs` are stored AFTER inner-most flattening, so a usage
 * `TList<TList<Integer>>` yields TWO occurrences:
 *
 *  - `{ templateName: "TList", typeArgs: ["Integer"],     flatName: "TList_Integer" }`
 *  - `{ templateName: "TList", typeArgs: ["TList_Integer"], flatName: "TList_TList_Integer" }`
 */
export interface GenericUsageOccurrence {
  readonly templateName: string;
  readonly typeArgs: readonly string[];
  readonly flatName: string;
  readonly line: number;
  readonly column: number;
}

/**
 * Public shape of a registered template — name + type-parameters +
 * source location. Bodies are intentionally NOT exposed; consumers that
 * need member shapes should use the standalone parser
 * ({@link import("./symbol-indexer").WorkspaceSymbolIndexer}) instead.
 */
export interface GenericTemplateInfo {
  readonly kind: "class" | "delegate";
  readonly name: string;
  readonly typeParams: readonly string[];
  readonly line: number;
}

/**
 * Aggregate result of one pass over a Data7 Basic source: templates
 * declared, monomorphic usages observed, warnings emitted along the way.
 *
 * Consumed by the live linter (warnings only) and by the symbol indexer
 * (templates + usages to synthesise flat-named members for IntelliSense).
 */
export interface GenericsContext {
  readonly templates: ReadonlyMap<string, GenericTemplateInfo>;
  readonly usages: readonly GenericUsageOccurrence[];
  readonly warnings: readonly GenericsPassWarning[];
}

/**
 * Visits every generic declaration + usage in `code` and returns the
 * full context. {@link analyzeGenericsPass} is a thin wrapper that
 * forwards the `warnings` array.
 */
export function collectGenericsContext(code: string): GenericsContext {
  const lines = code.split(/\r?\n/);
  const warnings: GenericsPassWarning[] = [];

  // Pass 1 — collect templates (with duplicate detection).
  const templates = new Map<string, TemplateText>();
  const remaining: { line: string; idx: number }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const classHeader = CLASS_GENERIC_HEADER_REGEX.exec(line);
    if (classHeader) {
      const name = classHeader[1] ?? "";
      const typeParams = parseTypeParams(classHeader[2] ?? "");
      const { body, endIdx } = consumeUntilEnd(lines, i, /^\s*End\s+Class\b/i);
      if (name && typeParams.length > 0) {
        registerTemplate(templates, warnings, {
          kind: "class",
          name,
          typeParams,
          body,
          line: i,
        });
      }
      i = endIdx + 1;
      continue;
    }

    const delegateHeader = DELEGATE_GENERIC_HEADER_REGEX.exec(line);
    if (delegateHeader) {
      const name = delegateHeader[1] ?? "";
      const typeParams = parseTypeParams(delegateHeader[2] ?? "");
      if (name && typeParams.length > 0) {
        registerTemplate(templates, warnings, {
          kind: "delegate",
          name,
          typeParams,
          body: [line],
          line: i,
        });
      }
      i++;
      continue;
    }

    remaining.push({ line, idx: i });
    i++;
  }

  // Pass 2 — scan usage sites. Strings and comments are stripped first
  // so a literal like `' uses TList<Product>` does NOT register a
  // phantom instantiation and does NOT trip `unknown-template`.
  const usages: GenericUsageOccurrence[] = [];
  for (const { line, idx } of remaining) {
    scanUsages(stripStringsAndComments(line), idx, templates, warnings, usages);
  }

  const publicTemplates = new Map<string, GenericTemplateInfo>();
  for (const [key, t] of templates) {
    publicTemplates.set(key, {
      kind: t.kind,
      name: t.name,
      typeParams: t.typeParams,
      line: t.line,
    });
  }

  return { templates: publicTemplates, usages, warnings };
}

/**
 * Backwards-compatible wrapper: returns only the warnings collected by
 * {@link collectGenericsContext}. Kept so existing call sites (linter,
 * tests) stay unchanged.
 */
export function analyzeGenericsPass(code: string): readonly GenericsPassWarning[] {
  return collectGenericsContext(code).warnings;
}

/**
 * Replaces string literals (`"..."`, `$"..."`) and comment tails (`'...`)
 * with same-length spaces. Identifiers/keywords/punctuation are
 * preserved verbatim so column-based regexes keep working. Uses the
 * shared `bas-tokenizer` so the rule "what is a string here?" matches
 * the textual pre-pass and the parser/lexer.
 *
 * Exported so the textual `runGenericsPass` (and any other line-oriented
 * scanner) can apply the same masking before searching for generic
 * usages — otherwise a comment like `' uses TList<T>` would be
 * rewritten to `' uses TList_T`, polluting the output with phantom
 * monomorphic copies.
 */
export function stripStringsAndComments(line: string): string {
  const tokens = tokenizeLine(line);
  const out = line.split("");
  for (const t of tokens) {
    if (t.kind !== "string" && t.kind !== "comment") continue;
    const col = t.col;
    for (let k = 0; k < t.value.length; k++) {
      if (col + k < out.length) out[col + k] = " ";
    }
  }
  return out.join("");
}

/** Parses a `<T, U, V>` parameter list into an array, stripping `As <constraint>`. */
function parseTypeParams(raw: string): string[] {
  return raw
    .split(",")
    .map(
      (p) =>
        p
          .trim()
          .split(/\s+As\s+/i)[0]
          ?.trim() ?? "",
    )
    .filter((p) => p.length > 0);
}

/**
 * Consumes lines from `lines[startIdx]` until (and including) the first
 * matching `endRegex`. Returns the captured body and the inclusive end
 * index so callers can advance.
 */
function consumeUntilEnd(
  lines: readonly string[],
  startIdx: number,
  endRegex: RegExp,
): { body: string[]; endIdx: number } {
  const body: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? "";
    body.push(line);
    if (i !== startIdx && endRegex.test(line)) {
      return { body, endIdx: i };
    }
  }
  return { body, endIdx: lines.length - 1 };
}

function registerTemplate(
  templates: Map<string, TemplateText>,
  warnings: GenericsPassWarning[],
  template: TemplateText & { line: number },
): void {
  const key = template.name.toLowerCase();
  if (templates.has(key)) {
    warnings.push({
      code: "duplicate-template",
      message: `Template generico duplicado '${template.name}'; o registro anterior foi sobrescrito.`,
      templateName: template.name,
      line: template.line,
    });
  }
  templates.set(key, {
    kind: template.kind,
    name: template.name,
    typeParams: template.typeParams,
    body: template.body,
    line: template.line,
  });
}

/**
 * Renders the canonical flat name for a generic usage. Mirrors the
 * convention used by `src/project/generics-monomorphizer/monomorphizer.ts`
 * so a future AST integration produces the same names.
 */
export function flatNameOf(baseName: string, typeArgs: readonly string[]): string {
  if (typeArgs.length === 0) return baseName;
  const flatArgs = typeArgs.map((t) => t.trim().replace(/\./g, "_").replace(/\s+/g, ""));
  return `${baseName}_${flatArgs.join("_")}`;
}

/**
 * Inner-first generic-usage finder. Walks the line and identifies the
 * deepest `<...>` group anchored to a PascalCase identifier; returning
 * the span so the caller can replace it and re-scan. Returning `null`
 * means no (further) generic usage was found.
 *
 * The returned `known` flag is `true` when the base name matches a
 * registered template; the caller can use that to emit a
 * `unknown-template` warning when `false`.
 */
export interface GenericUsageHit {
  readonly start: number;
  readonly end: number;
  readonly base: string;
  readonly typeArgs: readonly string[];
  /** `true` when the base name matches a registered template. */
  readonly known: boolean;
}

export function findInnerMostGenericUsage(
  line: string,
  templateNames: ReadonlySet<string>,
): GenericUsageHit | null {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "<") continue;
    let nameEnd = i;
    while (nameEnd > 0 && /\s/.test(line[nameEnd - 1] ?? "")) nameEnd--;
    let nameStart = nameEnd;
    while (nameStart > 0 && /[A-Za-z0-9_]/.test(line[nameStart - 1] ?? "")) nameStart--;
    const base = line.slice(nameStart, nameEnd);
    if (!base || !/^[A-Z]/.test(base)) continue;

    let j = i + 1;
    let valid = true;
    while (j < line.length && line[j] !== ">") {
      if (line[j] === "<") {
        valid = false;
        break;
      }
      j++;
    }
    if (!valid || j >= line.length) continue;

    const argsRaw = line.slice(i + 1, j);
    const typeArgs = argsRaw
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Reject things that look like generics but are actually comparison
    // operators. The not-equal operator `<>` produces empty args, and
    // `<=` / `< <number/expr>` produce args that do not start like a
    // type name. Without this guard, the idiomatic event-dispatch guard
    // `If me.OnXEvent <> NULL Then ...` (ubiquitous in Forms code) is
    // misread as a generic usage `OnXEvent<>` and trips `unknown-template`.
    if (typeArgs.length === 0) continue;
    if (!typeArgs.every((t) => /^[A-Za-z_]/.test(t))) continue;

    return {
      start: nameStart,
      end: j + 1,
      base,
      typeArgs,
      known: templateNames.has(base.toLowerCase()),
    };
  }
  return null;
}

function scanUsages(
  line: string,
  lineIdx: number,
  templates: ReadonlyMap<string, TemplateText>,
  warnings: GenericsPassWarning[],
  usages: GenericUsageOccurrence[],
): void {
  const names = new Set(templates.keys());
  let current = line;
  const seen = new Set<string>();
  for (let iter = 0; iter < 100; iter++) {
    const hit = findInnerMostGenericUsage(current, names);
    if (!hit) return;
    const key = `${hit.base}@${String(hit.start)}@${String(hit.typeArgs.length)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (!hit.known) {
      warnings.push({
        code: "unknown-template",
        message: `Uso generico referencia template desconhecido '${hit.base}'; deixado inalterado.`,
        templateName: hit.base,
        line: lineIdx,
        column: hit.start,
      });
      return;
    }
    const template = templates.get(hit.base.toLowerCase());
    if (!template) return;
    if (template.typeParams.length !== hit.typeArgs.length) {
      warnings.push({
        code: "generic-arity-mismatch",
        message: `Arity incompativel em '${template.name}': esperava ${String(template.typeParams.length)} argumentos de tipo, recebeu ${String(hit.typeArgs.length)}.`,
        templateName: template.name,
        expected: template.typeParams.length,
        actual: hit.typeArgs.length,
        line: lineIdx,
        column: hit.start,
      });
      return;
    }
    const flat = flatNameOf(template.name, hit.typeArgs);
    usages.push({
      templateName: template.name,
      typeArgs: hit.typeArgs,
      flatName: flat,
      line: lineIdx,
      column: hit.start,
    });
    current = current.slice(0, hit.start) + flat + current.slice(hit.end);
  }
}
