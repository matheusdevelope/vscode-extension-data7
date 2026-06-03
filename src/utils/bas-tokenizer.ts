/**
 * Single-line Data7 Basic tokenizer.
 *
 * Pure utility — no `vscode` dependency, no imports from other `src/`
 * layers. Lives in `src/utils/` so the project pipeline (generics pass,
 * future parser) and the analysis layer can share the same lexical
 * primitives.
 *
 * Goals:
 *
 *  - Recognise the lexical classes Data7 Basic uses: identifiers,
 *    keywords (typed loosely — any identifier matching the keyword set is
 *    classified as `"keyword"`), numbers (decimal, hex, float), strings
 *    (`"..."` with `""` escape, `$"..."` interpolation token), line
 *    comments (`'...`), and punctuation (`< > . , ( ) [ ] { } : = + - *
 *    / & ; ? @ |`).
 *  - Be lossless: every character in `line` lands in some token; the
 *    sequence of `value`s, when concatenated, reproduces the input
 *    verbatim (minus optional whitespace, see {@link tokenize}).
 *  - Carry the 0-based column where each token starts so callers (the
 *    refactored `instantiateTemplate`, the future parser) can map back
 *    to source positions.
 *
 * Not in scope (intentional):
 *  - Multi-line strings or block comments (Data7 has neither).
 *  - Macro / preprocessor directives.
 *  - Source location beyond the column index (file, line offsets) — the
 *    future multi-line lexer in `src/project/parser/lexer.ts` will track
 *    those.
 */

/** Discriminated token shape emitted by {@link tokenize}. */
export type Token =
  | IdentifierToken
  | KeywordToken
  | NumberToken
  | StringToken
  | CommentToken
  | PunctToken
  | WhitespaceToken;

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
 * `"..."` or `$"..."` string literal. `prefix` is `"$"` for
 * interpolation tokens and `""` for regular strings.
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

/**
 * Canonical Data7 Basic keyword set (case-insensitive lookups). New
 * keywords added by the language go here so the tokenizer can classify
 * identifiers as keywords without consulting a parser.
 */
const KEYWORDS: ReadonlySet<string> = new Set(
  [
    "And",
    "AndAlso",
    "As",
    "ByRef",
    "ByVal",
    "Case",
    "Catch",
    "Class",
    "Const",
    "Declare",
    "Delegate",
    "Dim",
    "Do",
    "Each",
    "Else",
    "ElseIf",
    "End",
    "Enum",
    "Exit",
    "False",
    "Finally",
    "For",
    "Function",
    "Get",
    "If",
    "Imports",
    "In",
    "Inherits",
    "Is",
    "Let",
    "Loop",
    "Match",
    "Me",
    "Mod",
    "MyBase",
    "Namespace",
    "New",
    "Next",
    "Not",
    "Nothing",
    "NULL",
    "Or",
    "OrElse",
    "Overridable",
    "Overrides",
    "Private",
    "Property",
    "Protected",
    "Public",
    "ReadOnly",
    "Return",
    "Select",
    "Set",
    "Shared",
    "Step",
    "Structure",
    "Sub",
    "Then",
    "Throw",
    "To",
    "True",
    "Try",
    "Until",
    "Using",
    "When",
    "While",
    "With",
    "Xor",
  ].map((k) => k.toLowerCase()),
);

/**
 * Tokenizes a single line of Data7 Basic source. Comments and strings
 * are recognised as single tokens (no nested tokenisation inside
 * `$"..."` — the interpolation expansion lives in `parseInterpolation`).
 *
 * `options.includeWhitespace` defaults to `false`; whitespace is
 * collapsed away so the caller's token stream is dense. Set it to
 * `true` when faithful round-tripping matters (the serializer in
 * `src/project/parser/serializer.ts` will use that mode).
 */
export function tokenize(
  line: string,
  options: { readonly includeWhitespace?: boolean } = {},
): Token[] {
  const includeWS = options.includeWhitespace === true;
  const tokens: Token[] = [];
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

    // Number literal: decimal, hex (`&H...`), optional decimal point,
    // optional `e`/`E` exponent.
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
      const kind = KEYWORDS.has(value.toLowerCase()) ? "keyword" : "identifier";
      tokens.push({ kind, value, col: start });
      continue;
    }

    // Multi-character punctuation — check 3-char operators FIRST so
    // `??=` is not split into `??` + `=`.
    const three = line.slice(i, i + 3);
    if (three === "??=" || three === "||=" || three === "&&=") {
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
      two === ".."
    ) {
      tokens.push({ kind: "punct", value: two, col: i });
      i += 2;
      continue;
    }

    // Any other single character is punctuation. We include things like
    // `<`, `>`, `(`, `)`, `.`, `,`, `=`, `+`, `-`, `*`, `/`, `&`, `:`,
    // `;`, `?`, `@`, `|`, `{`, `}`, `[`, `]`, etc.
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
