/** Normalizes generic/meta-programming syntax before the parser sees it. */
export function normalizeMetaProgrammingSyntax(line: string): string {
  if (/^\s*<#/.test(line)) return line;
  return line
    .replace(/\b([A-Za-z_]\w*)_<\s*([A-Za-z_]\w*)\s*>/g, "$1<$2>")
    .replace(/(?<![A-Za-z0-9_])<\s*([A-Za-z_]\w*)\s*>/g, "$1");
}
