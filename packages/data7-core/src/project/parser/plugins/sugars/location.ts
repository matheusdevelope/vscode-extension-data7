import type { SourceLocation } from "../../../ast/ast";
import type { TokenLocation } from "../../token-types";

/** Builds an AST source location from lexer coordinates. */
export function sourceLocation(loc: TokenLocation, endLoc?: TokenLocation): SourceLocation {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}
