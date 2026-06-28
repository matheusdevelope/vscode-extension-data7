/**
 * Public surface of the Data7 Basic parser.
 *
 * The internal split (`lexer.ts`, `parser.ts`, `parser-errors.ts`,
 * `token-types.ts`) is an implementation detail; consumers import
 * everything they need from this barrel.
 */

import { parse, parseExpr } from "./parser";
import type { ParseResult, ParseOptions } from "./parser";

export { tokenize } from "./lexer";
export { parse, parseExpr };
export type { ParseResult, ParseOptions };
export { makeError } from "./parser-errors";
export type { ParseError, ParseErrorCode } from "./parser-errors";
export { serializeUnit, serializeUnitWithMap, obfuscateLocalVariables } from "./serializer";
export type { SerializeOptions, SerializeResult } from "./serializer";
export type { Token, TokenKind, TokenLocation } from "./token-types";

/**
 * Convenience facade used by drivers (Fase 6) that want a single entry
 * point. Equivalent to {@link parse} but exported with a more
 * descriptive name.
 */
export function parseBasic(source: string, options?: ParseOptions): ParseResult {
  return parse(source, options);
}

export type { ParserPlugin } from "./plugin";
export { SugarsParserPlugin } from "./sugars-plugin";
export { GenericsParserPlugin } from "./generics-plugin";
