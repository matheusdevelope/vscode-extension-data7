/**
 * Public surface of the Data7 Basic parser.
 *
 * The internal split (`lexer.ts`, `parser.ts`, `parser-errors.ts`,
 * `token-types.ts`) is an implementation detail; consumers import
 * everything they need from this barrel.
 */

export { tokenize } from "./lexer";
export { parse } from "./parser";
export type { ParseResult } from "./parser";
export { makeError } from "./parser-errors";
export type { ParseError, ParseErrorCode } from "./parser-errors";
export { serializeUnit } from "./serializer";
export type { SerializeOptions } from "./serializer";
export type { Token, TokenKind, TokenLocation } from "./token-types";

/**
 * Convenience facade used by drivers (Fase 6) that want a single entry
 * point. Equivalent to {@link parse} but exported with a more
 * descriptive name.
 */
import { parse } from "./parser";
import type { ParseResult } from "./parser";

export function parseBasic(source: string): ParseResult {
  return parse(source);
}
