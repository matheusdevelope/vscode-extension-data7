/**
 * Multi-line lexer for Data7 Basic source files.
 *
 * Reuses the lexical primitives from {@link tokenizeLine} (in
 * `src/utils/bas-tokenizer.ts`) and stitches them across lines, emitting
 * an explicit `newline` token between lines and an `eof` token at the
 * end. The newline token makes line-oriented constructs (declaration
 * headers, opaque body lines) easy to recognise in the parser without
 * tracking column offsets manually.
 *
 * Position model:
 *
 *  - `line` is 1-based (matches the editor gutter).
 *  - `column` is 0-based (matches `bas-tokenizer.ts`).
 *  - The `newline` token's column is the column where the newline
 *    physically occurred (i.e. the length of the source line).
 *  - The `eof` token sits one past the last character of the last line.
 *
 * Comments are dropped — they carry no information for the AST.
 * Whitespace inside a line is collapsed (the per-line tokenizer already
 * discards whitespace by default).
 */

import { tokenize as tokenizeLine, type Token as LineToken } from "../../utils/bas-tokenizer";
import type { Token, TokenKind } from "./token-types";

/**
 * Tokenises the entire `source` and returns the resulting flat stream,
 * terminated by an `eof` token. Empty input still yields a single `eof`.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  // Preserve empty trailing line (split keeps it). We iterate explicitly
  // so the lexer is platform-aware (handles CR/LF and LF identically).
  const lines = source.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx] ?? "";
    const lineTokens = tokenizeLine(raw, { includeWhitespace: false });
    for (const lt of lineTokens) {
      const mapped = mapLineToken(lt, lineIdx + 1);
      if (mapped !== null) tokens.push(mapped);
    }
    // Emit a newline marker after every line except the last (the last
    // line is closed by `eof`).
    if (lineIdx < lines.length - 1) {
      tokens.push({
        kind: "newline",
        value: "\n",
        loc: { line: lineIdx + 1, column: raw.length },
      });
    }
  }

  const lastLine = lines.length === 0 ? 1 : lines.length;
  const lastCol = lines.length === 0 ? 0 : (lines[lines.length - 1]?.length ?? 0);
  tokens.push({ kind: "eof", value: "", loc: { line: lastLine, column: lastCol } });

  return tokens;
}

/**
 * Maps a single-line tokenizer token to the parser's wider token shape.
 * Returns `null` for tokens the parser does not need to see (whitespace,
 * comments).
 */
function mapLineToken(t: LineToken, line: number): Token | null {
  if (t.kind === "whitespace") return null;
  const kind: TokenKind = t.kind === "identifier" ? "identifier" : t.kind;
  return {
    kind,
    value: t.value,
    loc: { line, column: t.col },
    prefix: t.kind === "string" ? t.prefix : undefined,
  };
}
