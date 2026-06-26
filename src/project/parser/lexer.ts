/**
 * Multi-line lexer and single-line tokenizer for Data7 Basic source files.
 *
 * Position model:
 *
 *  - `line` is 1-based (matches the editor gutter).
 *  - `column` is 0-based.
 *  - The `newline` token's column is the column where the newline
 *    physically occurred (i.e. the length of the source line).
 *  - The `eof` token sits one past the last character of the last line.
 *
 * Comments are dropped — they carry no information for the AST.
 * Whitespace inside a line is collapsed (the per-line tokenizer already
 * discards whitespace by default).
 */

import type { Token, TokenKind } from "./token-types";
import { isLanguageKeyword } from "../language/keywords";

// ===========================================================================
// Single-line Tokenizer Types and Implementation
// ===========================================================================

export interface IdentifierToken {
  readonly kind: "identifier";
  readonly value: string;
  /** 0-based column where the token starts. */
  readonly col: number;
}

export interface KeywordToken {
  readonly kind: "keyword";
  readonly value: string;
  readonly col: number;
}

export interface NumberToken {
  readonly kind: "number";
  readonly value: string;
  readonly col: number;
}

/**
 * "..." or $"..." string literal. prefix is "$" for
 * interpolation tokens and "" for regular strings.
 */
export interface StringToken {
  readonly kind: "string";
  readonly value: string;
  readonly col: number;
  readonly prefix: "" | "$";
}

export interface CommentToken {
  readonly kind: "comment";
  readonly value: string;
  readonly col: number;
}

export interface PunctToken {
  readonly kind: "punct";
  readonly value: string;
  readonly col: number;
}

export interface WhitespaceToken {
  readonly kind: "whitespace";
  readonly value: string;
  readonly col: number;
}

export type LineToken =
  | IdentifierToken
  | KeywordToken
  | NumberToken
  | StringToken
  | CommentToken
  | PunctToken
  | WhitespaceToken;

/**
 * Tokenizes a single line of Data7 Basic source.
 */
export function tokenizeLine(
  line: string,
  options: { readonly includeWhitespace?: boolean } = {},
): LineToken[] {
  const includeWS = options.includeWhitespace === true;
  const tokens: LineToken[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    const ch = line[i] ?? "";

    // Whitespace.
    if (ch === " " || ch === "\t") {
      const start = i;
      while (i < n && (line[i] === " " || line[i] === "\t")) i++;
      if (includeWS) {
        tokens.push({ kind: "whitespace", value: line.slice(start, i), col: start });
      }
      continue;
    }

    // Line comment.
    if (ch === "'") {
      tokens.push({ kind: "comment", value: line.slice(i), col: i });
      return tokens;
    }

    // String literal (`"..."` with `""` escape).
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: "string", value: line.slice(start, i), col: start, prefix: "" });
      continue;
    }

    // `$"..."` interpolation token.
    if (ch === "$" && line[i + 1] === '"') {
      const start = i;
      i += 2;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      tokens.push({ kind: "string", value: line.slice(start, i), col: start, prefix: "$" });
      continue;
    }

    // Number literal.
    if (isDigit(ch) || (ch === "&" && (line[i + 1] === "H" || line[i + 1] === "h"))) {
      const start = i;
      if (ch === "&") {
        i += 2;
        while (i < n && isHexDigit(line[i] ?? "")) i++;
      } else {
        while (i < n && isDigit(line[i] ?? "")) i++;
        if (line[i] === "." && line[i + 1] !== ".") {
          i++;
          while (i < n && isDigit(line[i] ?? "")) i++;
        }
        if (line[i] === "e" || line[i] === "E") {
          i++;
          if (line[i] === "+" || line[i] === "-") i++;
          while (i < n && isDigit(line[i] ?? "")) i++;
        }
      }
      tokens.push({ kind: "number", value: line.slice(start, i), col: start });
      continue;
    }

    // Identifier or keyword.
    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentChar(line[i] ?? "")) i++;
      const value = line.slice(start, i);
      const kind = isLanguageKeyword(value) ? "keyword" : "identifier";
      tokens.push({ kind, value, col: start });
      continue;
    }

    // Multi-character punctuation.
    const three = line.slice(i, i + 3);
    if (three === "??=" || three === "||=" || three === "&&=" || three === "...") {
      tokens.push({ kind: "punct", value: three, col: i });
      i += 3;
      continue;
    }
    const two = line.slice(i, i + 2);
    if (
      two === "<=" ||
      two === ">=" ||
      two === "<>" ||
      two === "??" ||
      two === "?." ||
      two === "|>" ||
      two === ".." ||
      two === "+=" ||
      two === "-=" ||
      two === "*=" ||
      two === "/=" ||
      two === "=>"
    ) {
      tokens.push({ kind: "punct", value: two, col: i });
      i += 2;
      continue;
    }

    // Single character punctuation.
    tokens.push({ kind: "punct", value: ch, col: i });
    i++;
  }

  return tokens;
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

// ===========================================================================
// Multi-line Lexer Implementation
// ===========================================================================

/**
 * Tokenises the entire `source` and returns the resulting flat stream,
 * terminated by an `eof` token. Empty input still yields a single `eof`.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split(/\r?\n/);
  let continuationPending = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx] ?? "";
    const lineTokens = tokenizeLine(raw, { includeWhitespace: false });
    const hasLineContinuation = hasTrailingLineContinuation(lineTokens, raw);
    const isCommentOrEmpty: boolean =
      lineTokens.length === 0 || (lineTokens.length === 1 && lineTokens[0]?.kind === "comment");
    const continuesThroughComment: boolean = continuationPending && isCommentOrEmpty;
    const effectiveTokens = hasLineContinuation
      ? lineTokens.slice(0, -1)
      : continuesThroughComment
        ? []
        : lineTokens;
    for (const lt of effectiveTokens) {
      const mapped = mapLineToken(lt, lineIdx + 1);
      if (mapped !== null) tokens.push(mapped);
    }
    // Emit a newline marker after every line except the last.
    const continues: boolean = hasLineContinuation || continuesThroughComment;
    if (lineIdx < lines.length - 1 && !continues) {
      tokens.push({
        kind: "newline",
        value: "\n",
        loc: { line: lineIdx + 1, column: raw.length },
      });
    }
    continuationPending = continues;
  }

  const lastLine = lines.length === 0 ? 1 : lines.length;
  const lastCol = lines.length === 0 ? 0 : (lines[lines.length - 1]?.length ?? 0);
  tokens.push({ kind: "eof", value: "", loc: { line: lastLine, column: lastCol } });

  return tokens;
}

/**
 * Maps a single-line tokenizer token to the parser's wider token shape.
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

function hasTrailingLineContinuation(tokens: readonly LineToken[], rawLine: string): boolean {
  if (tokens.length === 0) return false;
  const lastNonCommentIdx =
    tokens[tokens.length - 1]?.kind === "comment" ? tokens.length - 2 : tokens.length - 1;
  if (lastNonCommentIdx < 0) return false;
  const lastNonCommentToken = tokens[lastNonCommentIdx];
  if (lastNonCommentToken?.kind === "identifier" && lastNonCommentToken.value === "_") {
    const rawAfterUnderscore = rawLine.slice(lastNonCommentToken.col + 1).trim();
    if (rawAfterUnderscore === "" || rawAfterUnderscore.startsWith("'")) {
      return true;
    }
  }
  return false;
}
