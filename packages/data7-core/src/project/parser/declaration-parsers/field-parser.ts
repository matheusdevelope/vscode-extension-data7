import type { Expression, FieldDeclaration, TypeReference } from "../../ast/ast";
import { Parser, locOf, emptyTypeReference, wrapArraySugarType } from "../parser";

export function parseField(parser: Parser): FieldDeclaration | null {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  parser.consume("keyword", "dim");
  parser.consume("identifier", "dim");
  const nameToken = parser.consume("identifier");
  if (nameToken === null) {
    parser.skipToEndOfLine();
    return null;
  }
  const name = nameToken.value;
  let type: TypeReference = emptyTypeReference();
  let hasAsNew = false;
  const nativeArrayDimensions = parser.parseNativeArrayDimensions();
  const isArraySugar = parser.consumeArraySugarMarker();
  if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
    if (parser.consume("keyword", "new") || parser.consume("identifier", "new")) {
      hasAsNew = true;
    }
    const t = parser.parseTypeReference();
    if (t !== null) {
      type = isArraySugar ? wrapArraySugarType(t, startLoc) : t;
    }
  }
  let initializer: Expression | undefined;
  const asNewArguments = hasAsNew ? parser.parseOptionalArgumentList() : [];
  if (parser.consume("punct", "=")) {
    initializer = parser.parseExpression();
  } else if (isArraySugar) {
    initializer = {
      kind: "ObjectCreationExpression",
      type,
      arguments: [],
      loc: type.loc,
    };
  } else if (hasAsNew) {
    initializer = {
      kind: "ObjectCreationExpression",
      type: type,
      arguments: asNewArguments,
      loc: type.loc,
    };
  }
  const comment = parser.skipToEndOfLine();
  const field: FieldDeclaration = {
    kind: "FieldDeclaration",
    name,
    type,
    initializer,
    isArraySugar,
    loc: locOf(startLoc),
    modifiers,
    comment,
  };
  if (nativeArrayDimensions !== undefined) field.nativeArrayDimensions = nativeArrayDimensions;
  return field;
}
