import { tokenizeLine } from "../parser/lexer";

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
  const tokens = tokenizeLine(line, { includeWhitespace: true });
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
        const isTypeCastCall = sub !== undefined && isCTypeCall(idx);
        if (sub !== undefined && (typeRefMode || isTypeCastCall) && !afterDot) {
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

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
