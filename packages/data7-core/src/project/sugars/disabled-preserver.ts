import { removeNumericSeparators } from "./plugins/numeric-separator";

/**
 * Detects source lines whose syntax belongs to a disabled sugar. They must be
 * preserved verbatim because the base grammar can otherwise consume a prefix
 * (for example `Return If` or `7_900`) and silently discard the remainder.
 */
export function isDisabledSugarSyntaxLine(
  sourceLine: string,
  disabledSugarIds: ReadonlySet<string>,
): boolean {
  if (disabledSugarIds.size === 0) return false;
  const code = stripStringsAndComment(sourceLine);
  const has = (id: string): boolean => disabledSugarIds.has(id);

  if (has("numeric-separator") && removeNumericSeparators(sourceLine) !== sourceLine) return true;
  if (has("return-if") && /^\s*return\s+if\b/i.test(code)) return true;
  if (
    (has("destructure-object") || has("destructure-array")) &&
    /^\s*(?:dim|const)\s*[{[]/i.test(code)
  ) {
    return true;
  }
  if (
    has("enum") &&
    /^\s*(?:(?:public|private|protected|shared|overrides|override|static|readonly)\s+)*enun\s+\w+\b/i.test(
      code,
    )
  ) {
    return true;
  }
  if (has("using") && /^\s*using\b/i.test(code)) return true;
  if (has("object-initializer") && /\bnew\b[\s\S]*\bwith\s*\{/i.test(code)) return true;
  if (has("optional-chain") && code.includes("?.")) return true;
  if (has("null-coalesce") && /\?\?=?/.test(code)) return true;
  if (has("logical-assignment") && /(?:\|\|=|&&=)/.test(code)) return true;
  if (has("pipe") && code.includes("|>")) return true;
  if (has("ternary") && /\?(?![.?])/.test(code)) return true;
  if (has("array-list") && (code.includes("=>") || code.includes("...") || code.includes("["))) {
    return true;
  }
  if (has("interpolation") && sourceLine.includes('$"')) return true;
  return has("tagged-template") && /\b[A-Za-z_]\w*\s*\$"/.test(sourceLine);
}

function stripStringsAndComment(sourceLine: string): string {
  let output = "";
  let index = 0;
  while (index < sourceLine.length) {
    const current = sourceLine[index] ?? "";
    if (current === "'") break;
    if (current === '"' || (current === "$" && sourceLine[index + 1] === '"')) {
      if (current === "$") output += " ";
      output += " ";
      index += current === "$" ? 2 : 1;
      while (index < sourceLine.length) {
        if (sourceLine[index] === '"') {
          if (sourceLine[index + 1] === '"') {
            index += 2;
            continue;
          }
          index++;
          break;
        }
        index++;
      }
      continue;
    }
    output += current;
    index++;
  }
  return output;
}
