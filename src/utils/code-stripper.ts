/**
 * Erases comments and string literals from a single Data7 Basic line so that
 * downstream regex-based scanners (Rename, Find-All-References, member
 * detection) do not match identifiers that happen to appear inside
 * `"text"`, `'text'` or trailing `' comments`.
 *
 *  - Comments are introduced by an apostrophe `'` outside a string literal,
 *    OR a leading `Rem` keyword.
 *  - String literals use double-quotes `"..."`; an embedded `""` is the
 *    classic VB/VBA escape for a single `"` and is preserved.
 *  - Single-quoted strings (`'foo'`) are NOT Data7 Basic literals — a `'`
 *    always starts a comment when seen outside a `"..."` block.
 *  - Column positions are preserved: every removed character is replaced with
 *    a space (or, in the case of a trailing comment, the comment chars become
 *    spaces too). This guarantees `cleaned.length === input.length` and that
 *    column-based slicing remains accurate.
 *
 *  Tab characters are preserved as-is so that callers using `String#indexOf`
 *  on the cleaned line get the same offsets as on the original.
 */
export function stripCommentsAndStringsLine(line: string): string {
  // Fast-paths for fully-commented lines.
  const trimmed = line.trimStart().toLowerCase();
  if (
    trimmed.startsWith("'") ||
    trimmed === "rem" ||
    trimmed.startsWith("rem ") ||
    trimmed.startsWith("rem\t")
  ) {
    return " ".repeat(line.length);
  }

  let result = "";
  let i = 0;
  let inString = false;
  while (i < line.length) {
    const ch = line[i];
    if (inString) {
      if (ch === '"') {
        // Escaped quote `""` → still inside the string, swallow the second one too.
        if (line[i + 1] === '"') {
          result += "  ";
          i += 2;
          continue;
        }
        inString = false;
        result += '"';
        i++;
        continue;
      }
      result += " ";
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += '"';
      i++;
      continue;
    }
    if (ch === "'") {
      // Start of a line comment — blank out the rest of the line.
      result += " ".repeat(line.length - i);
      break;
    }
    result += ch;
    i++;
  }
  return result;
}

/**
 * Multiline variant of `stripCommentsAndStringsLine` — splits the text by
 * `\r?\n`, processes each line individually and re-joins. Always uses `\n`
 * for re-joining because callers only care about column-preserving content
 * per line.
 */
export function stripCommentsAndStrings(text: string): string {
  return text.split(/\r?\n/).map(stripCommentsAndStringsLine).join("\n");
}
