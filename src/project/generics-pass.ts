/**
 * Textual generics pre-pass for the Data7 Basic Builder.
 *
 * The Data7 compiler does not understand `<T>` syntax, so we monomorphise
 * every generic declaration into flat-named copies before the rest of the
 * sugar pipeline (in `SugarTranspiler.transpile`) runs.
 *
 * Scope of this minimal first version:
 *
 *  - **Generic classes** declared as `Class TList<T>` ... `End Class`. The
 *    type parameter list supports one or more comma-separated parameters
 *    (`TPair<K, V>`).
 *  - **Generic delegates** declared as `Delegate Sub|Function Pred<T>(...)`.
 *  - **Usage sites** that reference a generic type with concrete type
 *    arguments: `TList<Product>`, `Pred<CardRecord>`, `TList<TList<Integer>>`.
 *
 * Out of scope (left for the AST-based engine):
 *
 *  - Generic methods inside classes (require body rewrites + member-call
 *    resolution).
 *  - Constraints (`Class TList<T As BaseEnum>` — the constraint clause is
 *    silently stripped here; deeper validation is the linter's job).
 *  - Variance, defaults, higher-kinded parameters.
 *
 * Pipeline:
 *
 *  1. Pass 1 — collect every generic declaration. Each declaration is
 *     stored verbatim in a `TemplateText` record and the corresponding
 *     lines are REMOVED from the working code (so the Data7 compiler
 *     never sees `<T>`).
 *  2. Pass 2 — scan the remaining code for usage sites, build the
 *     transitive set of needed flat names, and rewrite each usage to its
 *     flat name in place.
 *  3. Pass 3 — for every flat name that was scheduled, clone the
 *     template, substitute the type parameter list, and emit the
 *     monomorphic copy at the head of the file. Nested generics are
 *     resolved by re-running pass 2 on the freshly emitted body.
 *
 * Output: `{ code, flatNames, warnings }` — the rewritten `.bas` source,
 * the set of flat names that the analyser / IntelliSense can register,
 * and any warnings emitted during the pass.
 *
 * The lightweight `analyzeGenericsPass(code)` API used by the live
 * linter lives in `src/analysis/generics-analyzer.ts` so the diagnostics
 * layer can import it without crossing the `project/` fence.
 */

import {
  type GenericsPassWarning,
  findInnerMostGenericUsage,
  flatNameOf,
  stripStringsAndComments,
} from "../analysis/generics-analyzer";
import { tokenize } from "../utils/bas-tokenizer";

export { analyzeGenericsPass, flatNameOf } from "../analysis/generics-analyzer";
export type { GenericsPassWarning, GenericsPassWarningCode } from "../analysis/generics-analyzer";

const MAX_INSTANTIATIONS = 10_000;

export interface GenericsPassResult {
  readonly code: string;
  /** Flat names emitted by the pass (e.g. `TList_Product`). */
  readonly flatNames: readonly string[];
  /** Warnings emitted while scanning + monomorphising the input. */
  readonly warnings: readonly GenericsPassWarning[];
}

interface TemplateText {
  readonly kind: "class" | "delegate" | "function";
  readonly name: string;
  readonly typeParams: readonly string[];
  /** Verbatim source lines, including the declaration header. */
  readonly body: readonly string[];
}

/**
 * Runs the generics pre-pass on a `.bas` source. Returns the rewritten
 * source plus the flat names that were emitted, so callers can register
 * them with the workspace indexer for design-time IntelliSense.
 */
export function runGenericsPass(code: string): GenericsPassResult {
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const lines = code.split(/\r?\n/);
  const warnings: GenericsPassWarning[] = [];

  // --- Pass 1: collect templates and prune them from the body. ---
  const templates = new Map<string, TemplateText>();
  const remaining: string[] = [];
  let i = 0;
  // Tracks the structural depth of Class/Structure blocks so we can
  // distinguish a FREE generic function (namespace-level) from a
  // class-level generic METHOD (which the textual pass cannot rewrite
  // safely and is instead surfaced as `class-generic-method-unsupported`).
  let classDepth = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const classHeader = CLASS_GENERIC_HEADER_REGEX.exec(line);
    if (classHeader) {
      const name = classHeader[1] ?? "";
      const typeParams = parseTypeParams(classHeader[2] ?? "");
      const { body, endIdx } = consumeUntilEnd(lines, i, /^\s*End\s+Class\b/i);
      if (name && typeParams.length > 0) {
        // Inspect body for generic METHOD declarations and emit a
        // `class-generic-method-unsupported` warning per occurrence.
        for (let bIdx = 1; bIdx < body.length; bIdx++) {
          const bLine = body[bIdx] ?? "";
          const m = METHOD_GENERIC_HEADER_REGEX.exec(bLine);
          if (m) {
            pushWarning(warnings, {
              code: "class-generic-method-unsupported",
              message: `Metodo generico '${m[2] ?? ""}' dentro da classe '${name}' nao e suportado pelo pre-pass textual; deixado inalterado.`,
              templateName: m[2] ?? "",
              line: i + bIdx,
            });
          }
        }
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

    // Non-generic class block — still track depth to scope the
    // free-function regex correctly when nested.
    if (CLASS_PLAIN_HEADER_REGEX.test(line)) {
      classDepth++;
      remaining.push(line);
      i++;
      continue;
    }
    if (/^\s*End\s+Class\b/i.test(line) && classDepth > 0) {
      classDepth--;
      remaining.push(line);
      i++;
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

    const fnHeader = FUNCTION_GENERIC_HEADER_REGEX.exec(line);
    if (fnHeader) {
      const subOrFunction = (fnHeader[1] ?? "").toLowerCase();
      const name = fnHeader[2] ?? "";
      const typeParams = parseTypeParams(fnHeader[3] ?? "");
      if (classDepth > 0) {
        // Generic method inside a class — emit warning, leave the
        // declaration in place so the downstream compiler still sees it
        // (and fails with its own clear error).
        pushWarning(warnings, {
          code: "class-generic-method-unsupported",
          message: `Metodo generico '${name}' dentro de classe nao e suportado pelo pre-pass textual; deixado inalterado.`,
          templateName: name,
          line: i,
        });
        remaining.push(line);
        i++;
        continue;
      }
      const endRegex = subOrFunction === "sub" ? /^\s*End\s+Sub\b/i : /^\s*End\s+Function\b/i;
      const { body, endIdx } = consumeUntilEnd(lines, i, endRegex);
      if (name && typeParams.length > 0) {
        registerTemplate(templates, warnings, {
          kind: "function",
          name,
          typeParams,
          body,
          line: i,
        });
      }
      i = endIdx + 1;
      continue;
    }

    remaining.push(line);
    i++;
  }

  if (templates.size === 0) {
    return { code, flatNames: [], warnings };
  }

  // --- Pass 2: discover usage sites + rewrite to flat names. ---
  const worklist: (readonly string[])[] = [];
  const seenFlat = new Set<string>();
  const flatToCanonical = new Map<string, string>();

  const scheduleUsage = (template: TemplateText, typeArgs: readonly string[]): string => {
    const flat = flatNameOf(template.name, typeArgs);
    const canonical = canonicalUsageString(template.name, typeArgs);
    const previous = flatToCanonical.get(flat);
    if (previous !== undefined && previous !== canonical) {
      pushWarning(warnings, {
        code: "flat-name-collision",
        message: `Duas instanciacoes distintas '${previous}' e '${canonical}' colapsam ao mesmo nome flat '${flat}'. Renomeie um dos tipos para desambiguar.`,
        flatName: flat,
      });
    } else if (previous === undefined) {
      flatToCanonical.set(flat, canonical);
    }
    if (!seenFlat.has(flat)) {
      seenFlat.add(flat);
      worklist.push(typeArgs);
      worklist.push([template.name]);
    }
    return flat;
  };

  const rewriteUsages = (input: readonly string[], baseLine: number): string[] => {
    const out: string[] = [];
    for (let k = 0; k < input.length; k++) {
      const line = input[k] ?? "";
      out.push(rewriteLine(line, templates, scheduleUsage, warnings, baseLine + k));
    }
    return out;
  };

  const rewritten = rewriteUsages(remaining, 0);

  // --- Pass 3: drain the worklist and inject monomorphic copies. ---
  const emitted: string[] = [];
  let instantiations = 0;
  for (let w = 0; w < worklist.length; w += 2) {
    if (instantiations >= MAX_INSTANTIATIONS) {
      pushWarning(warnings, {
        code: "instantiation-limit-exceeded",
        message: `Limite de ${String(MAX_INSTANTIATIONS)} instanciacoes excedido; entradas restantes foram descartadas.`,
      });
      break;
    }
    instantiations++;
    const typeArgs = worklist[w] ?? [];
    const markerArr = worklist[w + 1] ?? [];
    const templateName = markerArr[0] ?? "";
    const template = templates.get(templateName.toLowerCase());
    if (!template) continue;
    if (template.typeParams.length !== typeArgs.length) {
      pushWarning(warnings, {
        code: "generic-arity-mismatch",
        message: `Arity incompativel em '${template.name}': esperava ${String(template.typeParams.length)} argumentos de tipo, recebeu ${String(typeArgs.length)}.`,
        templateName: template.name,
        expected: template.typeParams.length,
        actual: typeArgs.length,
      });
      continue;
    }
    const monomorphic = instantiateTemplate(template, typeArgs, templates);
    // Re-run pass 2 on the monomorphic body so nested generics
    // (`TList<TList<Integer>>`) are also scheduled.
    const rewrittenMono = rewriteUsages(monomorphic, 0);
    emitted.push(...rewrittenMono);
  }

  // Find if there is an End Namespace line in rewritten code.
  let endNamespaceIdx = -1;
  for (let idx = rewritten.length - 1; idx >= 0; idx--) {
    const line = rewritten[idx] ?? "";
    if (/^\s*End\s+Namespace\b/i.test(line)) {
      endNamespaceIdx = idx;
      break;
    }
  }

  let finalLines: string[];
  if (endNamespaceIdx !== -1) {
    // Insert inside the namespace, at the end of it (just before End Namespace)
    finalLines = [
      ...rewritten.slice(0, endNamespaceIdx),
      ...emitted,
      ...rewritten.slice(endNamespaceIdx),
    ];
  } else {
    // No namespace. Append emitted at the end of the file (guaranteed to be below imports).
    finalLines = [...rewritten, "", ...emitted];
  }

  return {
    code: finalLines.join(eol),
    flatNames: [...seenFlat],
    warnings,
  };
}

// =============================================================================
// Helpers
// =============================================================================

const CLASS_GENERIC_HEADER_REGEX = /^\s*Class\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*$/i;
const CLASS_PLAIN_HEADER_REGEX = /^\s*Class\s+[A-Za-z_]\w*\b(?![<\w])/i;
const DELEGATE_GENERIC_HEADER_REGEX =
  /^\s*Delegate\s+(?:Sub|Function)\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*\(.*\)/i;
/**
 * Matches a free generic function declaration at namespace level. The
 * optional modifier prefix mirrors VB.NET-style visibility keywords
 * (`Public`, `Private`, `Protected`, `Shared`, `Overridable`,
 * `Overrides`).
 *
 * Capture groups:
 *  1. `Sub` | `Function`
 *  2. Function name (e.g. `Map`)
 *  3. Type parameter list inside `< >`
 */
const FUNCTION_GENERIC_HEADER_REGEX =
  /^\s*(?:(?:Public|Private|Protected|Shared|Overridable|Overrides)\s+)*(Sub|Function)\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*\(/i;
/**
 * Same shape as the free-function regex but used only to scan inside
 * class bodies, where the match means the user wrote a generic METHOD
 * inside a class — which the textual pass cannot safely rewrite.
 *
 * Capture groups: identical to {@link FUNCTION_GENERIC_HEADER_REGEX}.
 */
const METHOD_GENERIC_HEADER_REGEX =
  /^\s*(?:(?:Public|Private|Protected|Shared|Overridable|Overrides)\s+)*(Sub|Function)\s+([A-Za-z_]\w*)\s*<\s*([^>]+?)\s*>\s*\(/i;

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

/**
 * Registers a template in `templates`, emitting a `duplicate-template`
 * warning when the name was already present (the latest registration
 * overrides the previous one, mirroring the AST engine).
 */
function registerTemplate(
  templates: Map<string, TemplateText>,
  warnings: GenericsPassWarning[],
  template: TemplateText & { line: number },
): void {
  const key = template.name.toLowerCase();
  if (templates.has(key)) {
    pushWarning(warnings, {
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
  });
}

/**
 * Canonical (un-flattened) string used for `flat-name-collision`
 * detection. Two structurally different usages observed at distinct
 * sites should yield different canonical strings.
 */
function canonicalUsageString(name: string, typeArgs: readonly string[]): string {
  if (typeArgs.length === 0) return name;
  return `${name}<${typeArgs.map((t) => t.trim()).join(",")}>`;
}

function pushWarning(warnings: GenericsPassWarning[], w: GenericsPassWarning): void {
  warnings.push(w);
}

/**
 * Rewrites every generic usage `Name<Args>` on `line` to its flat form,
 * innermost-first to support nested generics (`TList<TList<Integer>>`).
 * Calls `schedule` for each fresh usage so the caller can enqueue the
 * monomorphic emission.
 *
 * The `Name` must start with an uppercase letter — convention for class
 * names in Data7. Lowercase identifiers like `data < other > 0` are NOT
 * interpreted as generic usages.
 */
function rewriteLine(
  line: string,
  templates: ReadonlyMap<string, TemplateText>,
  schedule: (template: TemplateText, typeArgs: readonly string[]) => string,
  warnings: GenericsPassWarning[],
  lineIdx: number,
): string {
  let current = line;
  // `scanRegion` is `current` with string literals and comment tails
  // replaced by same-length spaces — the columns stay aligned with
  // `current`, but a usage like `' demo TList<T>` inside a comment can
  // never match because the masking turned it into whitespace. Without
  // this, the textual pass would emit a phantom `TList_T` flat copy for
  // every example file whose header mentions `TList<T>` (see Bug #2 in
  // the generics-audit).
  let scanRegion = stripStringsAndComments(line);
  const names = new Set(templates.keys());
  // Track usages we've already warned about so we don't loop forever on
  // an unknown usage (the rewrite is no-op for unknown templates).
  const warnedUnknown = new Set<string>();
  // Cap iterations defensively to avoid infinite loops on malformed input.
  for (let iter = 0; iter < 100; iter++) {
    const hit = findInnerMostGenericUsage(scanRegion, names);
    if (!hit) return current;
    if (!hit.known) {
      const key = `${hit.base}@${String(hit.start)}`;
      if (!warnedUnknown.has(key)) {
        warnedUnknown.add(key);
        pushWarning(warnings, {
          code: "unknown-template",
          message: `Uso generico referencia template desconhecido '${hit.base}'; deixado inalterado.`,
          templateName: hit.base,
          line: lineIdx,
          column: hit.start,
        });
      }
      return current;
    }
    const template = templates.get(hit.base.toLowerCase());
    if (!template) return current;
    if (template.typeParams.length !== hit.typeArgs.length) {
      pushWarning(warnings, {
        code: "generic-arity-mismatch",
        message: `Arity incompativel em '${template.name}': esperava ${String(template.typeParams.length)} argumentos de tipo, recebeu ${String(hit.typeArgs.length)}.`,
        templateName: template.name,
        expected: template.typeParams.length,
        actual: hit.typeArgs.length,
        line: lineIdx,
        column: hit.start,
      });
      return current;
    }
    const flat = schedule(template, hit.typeArgs);
    current = current.slice(0, hit.start) + flat + current.slice(hit.end);
    scanRegion = scanRegion.slice(0, hit.start) + flat + scanRegion.slice(hit.end);
  }
  return current;
}

/**
 * Substitutes every occurrence of each type parameter inside the template
 * body with the matching concrete type, renames the declaration header to
 * its flat form, and drops constraint clauses on the way.
 */
function instantiateTemplate(
  template: TemplateText,
  typeArgs: readonly string[],
  templates: ReadonlyMap<string, TemplateText>,
): string[] {
  const flatName = flatNameOf(template.name, typeArgs);
  const subs = new Map<string, string>();
  for (let i = 0; i < template.typeParams.length; i++) {
    const tp = template.typeParams[i];
    const ta = typeArgs[i];
    if (tp && ta) subs.set(tp, ta);
  }

  return template.body.map((line, idx) => {
    let out = line;

    // The declaration header (first line) gets the flat name and loses
    // its `<...>` parameter list entirely. We do this with a regex
    // because the header has a known shape (`Class TList<...>` /
    // `Delegate ... Pred<...>`), and the tokenizer-driven substitution
    // below must NOT also rewrite the parameter list as a type argument
    // list of itself.
    if (idx === 0) {
      out = out.replace(
        new RegExp(`\\b${escapeRegExp(template.name)}\\s*<\\s*[^>]+?\\s*>`),
        flatName,
      );
    }

    // Lexical-aware substitution: only rewrite identifiers that match a
    // type parameter when they appear in a TYPE REFERENCE position.
    // This avoids the Bug 1 family where a local variable, parameter
    // name, member access, comment, or string literal that happens to
    // share a letter with a type parameter (`T`, `U`) was previously
    // rewritten by the unguarded regex.
    out = substituteTypeParamsInLine(out, subs, templates);

    // Rename the template's own name in the body lines so a Basic
    // return-by-name idiom inside a `Function Wrap<T>` (`Wrap = pValue`)
    // becomes `Wrap_Integer = pValue` after monomorphization. Without
    // this the generated function would assign to a stray local and
    // return the default value instead of `pValue`. Skips occurrences
    // after `.` (member access), inside strings/comments, and inside
    // type-argument lists already rewritten on the header line.
    if (idx > 0) {
      out = substituteTemplateNameInBodyLine(out, template.name, flatName);
    }

    return out;
  });
}

/**
 * Rewrites every bare identifier matching `templateName` to `flatName`
 * outside of strings, comments, and member-access positions. Used in
 * `instantiateTemplate` for body lines so a Function's return-by-name
 * idiom (`Wrap = pValue`) keeps working after the function is renamed
 * to its flat form (`Wrap_Integer`).
 */
function substituteTemplateNameInBodyLine(
  line: string,
  templateName: string,
  flatName: string,
): string {
  const tokens = tokenize(line, { includeWhitespace: true });
  const parts: string[] = [];
  let afterDot = false;

  const isGenericUsage = (idx: number): boolean => {
    let nextIdx = idx + 1;
    while (nextIdx < tokens.length && tokens[nextIdx]?.kind === "whitespace") {
      nextIdx++;
    }
    return tokens[nextIdx]?.kind === "punct" && tokens[nextIdx]?.value === "<";
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t === undefined) continue;
    switch (t.kind) {
      case "whitespace":
      case "comment":
      case "string":
      case "number":
        parts.push(t.value);
        continue;
      case "punct":
        afterDot = t.value === ".";
        parts.push(t.value);
        continue;
      case "identifier":
      case "keyword":
        if (!afterDot && t.value === templateName && !isGenericUsage(idx)) {
          parts.push(flatName);
        } else {
          parts.push(t.value);
        }
        afterDot = false;
        continue;
    }
  }
  return parts.join("");
}

/**
 * Walks the token stream of a single source line and replaces only those
 * identifier occurrences that sit in a type-reference position with the
 * matching concrete type. Comments and string literals are preserved
 * verbatim. Identifiers immediately after `.` (member access) are never
 * substituted. Identifiers in variable-name position (e.g. `Dim T = ...`)
 * are never substituted because no `As`/`New`/`Inherits`/`Implements` has
 * primed the parser into type-reference mode.
 *
 * Type-reference mode is entered after the keywords `As`, `New`,
 * `Inherits`, `Implements` and stays active while we are inside a
 * balanced `<...>` block (so nested generics like `List<Pair<T, U>>` keep
 * substituting). It is exited on `=`, `(`, `)`, `,` at depth 0, line
 * boundary, or any keyword that resets the position.
 */
export function substituteTypeParamsInLine(
  line: string,
  subs: ReadonlyMap<string, string>,
  templates: { has(name: string): boolean },
): string {
  if (subs.size === 0) return line;
  const tokens = tokenize(line, { includeWhitespace: true });
  const parts: string[] = [];
  let typeRefMode = false;
  let angleDepth = 0;
  let afterDot = false;
  let inCType = false;
  let cTypeParenDepth = 0;

  const resetMode = (): void => {
    typeRefMode = false;
    angleDepth = 0;
  };

  const isGenericUsage = (idx: number): boolean => {
    let nextIdx = idx + 1;
    while (nextIdx < tokens.length && tokens[nextIdx]?.kind === "whitespace") {
      nextIdx++;
    }
    return tokens[nextIdx]?.kind === "punct" && tokens[nextIdx]?.value === "<";
  };

  const isCTypeCall = (idx: number): boolean => {
    let nextIdx = idx + 1;
    while (nextIdx < tokens.length && tokens[nextIdx]?.kind === "whitespace") {
      nextIdx++;
    }
    return tokens[nextIdx]?.kind === "punct" && tokens[nextIdx]?.value === "(";
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const t = tokens[idx];
    if (t === undefined) continue;
    switch (t.kind) {
      case "whitespace":
        parts.push(t.value);
        continue;
      case "comment":
        parts.push(t.value);
        continue;
      case "string":
      case "number":
        parts.push(t.value);
        resetMode();
        afterDot = false;
        continue;
      case "keyword": {
        const k = t.value.toLowerCase();
        if (k === "as" || k === "new" || k === "inherits" || k === "implements") {
          typeRefMode = true;
          angleDepth = 0;
        } else {
          resetMode();
        }
        afterDot = false;
        parts.push(t.value);
        continue;
      }
      case "punct":
        parts.push(t.value);
        if (t.value === "<" && typeRefMode) {
          angleDepth++;
        } else if (t.value === ">" && angleDepth > 0) {
          angleDepth--;
          if (angleDepth === 0) typeRefMode = false;
        } else if (t.value === ".") {
          afterDot = true;
          continue;
        } else if (t.value === "(") {
          if (inCType) {
            cTypeParenDepth++;
          } else {
            resetMode();
          }
        } else if (t.value === ")") {
          if (inCType) {
            cTypeParenDepth--;
            if (cTypeParenDepth === 0) {
              inCType = false;
              typeRefMode = false;
            }
          } else {
            resetMode();
          }
        } else if (t.value === "=") {
          resetMode();
        } else if (t.value === ",") {
          if (inCType && cTypeParenDepth === 1 && angleDepth === 0) {
            typeRefMode = true;
            angleDepth = 0;
          } else if (angleDepth === 0) {
            resetMode();
          }
        }
        afterDot = false;
        continue;
      case "identifier": {
        const nameLower = t.value.toLowerCase();
        if (nameLower === "ctype" && isCTypeCall(idx)) {
          inCType = true;
          cTypeParenDepth = 0;
          afterDot = false;
          parts.push(t.value);
          continue;
        }

        if (templates.has(nameLower) && isGenericUsage(idx)) {
          typeRefMode = true;
        }

        const sub = subs.get(t.value);
        if (sub !== undefined && typeRefMode && !afterDot) {
          parts.push(sub);
        } else {
          parts.push(t.value);
        }
        afterDot = false;
        continue;
      }
      default: {
        const exhaustive: never = t;
        void exhaustive;
        continue;
      }
    }
  }

  return parts.join("");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
