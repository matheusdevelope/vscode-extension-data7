/** Removes numeric separators without touching strings or comments. */
export function removeNumericSeparators(line: string): string {
  if (!line.includes("_")) return line;
  let out = "";
  let i = 0;
  while (i < line.length) {
    const c = line[i] ?? "";
    if (c === "'") return out + line.substring(i);
    if (c === '"' || (c === "$" && line[i + 1] === '"')) {
      const quoteStart = c === "$" ? 2 : 1;
      out += c === "$" ? '$"' : '"';
      i += quoteStart;
      while (i < line.length) {
        const current = line[i] ?? "";
        if (current === '"') {
          if (line[i + 1] === '"') {
            out += '""';
            i += 2;
            continue;
          }
          out += '"';
          i++;
          break;
        }
        out += current;
        i++;
      }
      continue;
    }
    if (c >= "0" && c <= "9" && !/[A-Za-z0-9_]/.test(line[i - 1] ?? "")) {
      let j = i;
      while (j < line.length) {
        const current = line[j] ?? "";
        if (
          (current >= "0" && current <= "9") ||
          current === "." ||
          current === "e" ||
          current === "E"
        ) {
          j++;
          continue;
        }
        if (
          current === "_" &&
          (line[j - 1] ?? "") >= "0" &&
          (line[j - 1] ?? "") <= "9" &&
          (line[j + 1] ?? "") >= "0" &&
          (line[j + 1] ?? "") <= "9"
        ) {
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
  return out;
}
