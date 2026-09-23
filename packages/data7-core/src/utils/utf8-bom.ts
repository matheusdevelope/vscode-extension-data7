/**
 * UTF-8 BOM (U+FEFF). Node's `readFile(..., "utf-8")` keeps it; VS Code
 * `TextDocument.getText()` does not. Workspace lint from disk then disagreed
 * with the open editor: the BOM became a token, `Imports` was not a directive,
 * and Problems cleared as soon as the tab opened.
 */
export function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
