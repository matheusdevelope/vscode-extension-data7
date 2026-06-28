/**
 * Parse-error model + recovery utilities for the Data7 Basic parser.
 *
 * The parser is **non-throwing**: every encountered syntax problem is
 * pushed to a `ParseError[]` collected on the result so a single bad line
 * does not blank the entire AST. The parser uses `ParserRecovery` to
 * skip ahead to a sensible resync point (next `End <kind>` or the start
 * of the next statement) and then resumes parsing.
 */

import type { TokenLocation } from "./token-types";

/**
 * One syntax error discovered by the parser. `code` is a stable kebab-
 * case identifier so consumers (tests, future linter wiring) can target
 * specific kinds of failure.
 */
export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
  readonly loc: TokenLocation;
}

/**
 * Closed set of error codes the parser can emit. Add new codes here when
 * a new construct grows a dedicated error branch; the union forces every
 * call site to be updated explicitly.
 */
export type ParseErrorCode =
  | "expected-token"
  | "unexpected-token"
  | "unterminated-block"
  | "invalid-type-reference"
  | "invalid-declaration";

export function makeError(code: ParseErrorCode, message: string, loc: TokenLocation): ParseError {
  return { code, message, loc };
}
