import type { DestructuringBinding, Expression, Statement } from "../../../ast/ast";
import type { Parser } from "../../parser";
import { sourceLocation } from "./location";

/** Parses `Dim { key As alias } = value` and `Dim [first, ...rest] = value`. */
export function parseDestructuringDeclaration(parser: Parser): Statement | null {
  const startLoc = parser.peek().loc;
  const isOpenBrace = parser.consume("punct", "{") !== null;
  const isOpenBracket = !isOpenBrace && parser.consume("punct", "[") !== null;
  if (!isOpenBrace && !isOpenBracket) return null;

  const isObject = isOpenBrace;
  const bindings: DestructuringBinding[] = [];
  const closeChar = isObject ? "}" : "]";
  while (!parser.match("punct", closeChar) && !parser.isEOF() && !parser.match("newline")) {
    let name = "";
    let property: string | undefined;
    let defaultValue: Expression | undefined;
    const isRest = !isObject && parser.consume("punct", "...") !== null;
    const rawName = parser.expect("identifier", "<destructuring-name>")?.value ?? "";

    if (isObject && (parser.consume("keyword", "as") || parser.consume("identifier", "as"))) {
      name = parser.expect("identifier", "<binding-name>")?.value ?? "";
      property = rawName;
    } else {
      name = rawName;
    }
    if (parser.consume("punct", "=")) defaultValue = parser.parseExpression();
    bindings.push({ name, property, defaultValue, isRest });
    if (!parser.consume("punct", ",")) break;
  }

  parser.expect("punct", closeChar, { literal: true });
  parser.expect("punct", "=", { literal: true });
  const initializer = parser.parseExpression();
  const comment = parser.skipToEndOfLine();
  return {
    kind: "DestructuredVariableDeclaration",
    isObject,
    bindings,
    initializer,
    loc: sourceLocation(startLoc),
    comment,
  };
}
