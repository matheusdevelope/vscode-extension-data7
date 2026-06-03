/**
 * Token kinds + token shape consumed by the Data7 Basic parser.
 *
 * Lives in `src/project/parser/`. Per the architecture rule in
 * `architecture.mdc#parser-isolation`, this folder is a sub-leaf that
 * depends only on `src/utils/` and may import **types only** from
 * `src/project/generics-monomorphizer/ast`. The fence is enforced by
 * `data7/parser-isolation` in `eslint.config.mjs`.
 */

/**
 * Discriminated kinds the lexer emits. Sub-categorisation deliberately
 * stays coarse — the parser does its own classification (e.g. "is this
 * identifier a contextual modifier?") rather than baking it into the
 * lexer.
 */
export type TokenKind =
  | "identifier"
  | "keyword"
  | "number"
  | "string"
  | "punct"
  | "newline"
  | "comment"
  | "eof";

/**
 * 1-based line / 0-based column. Lines are 1-based to match the editor's
 * gutter; columns are 0-based to match the textual generics pass and the
 * `bas-tokenizer.ts` helper.
 */
export interface TokenLocation {
  readonly line: number;
  readonly column: number;
}

export interface Token {
  readonly kind: TokenKind;
  readonly value: string;
  readonly loc: TokenLocation;
  readonly prefix?: "" | "$";
}
