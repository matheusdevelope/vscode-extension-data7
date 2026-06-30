import type { Expression, Statement, TypeReference, VariableDeclaration } from "../../ast/ast";
import { Parser, locOf, wrapArraySugarType } from "../parser";
import type { TokenLocation } from "../token-types";

export function parseLocalVariableDeclaration(parser: Parser): Statement {
  const startLoc = parser.peek().loc;
  const isConst = parser.peek().value.toLowerCase() === "const";
  parser.advance(); // consume 'Dim'/'Const'
  return parseLocalVariableDeclarationAfterDim(parser, startLoc, isConst);
}

export function parseSingleVariableDeclaration(
  parser: Parser,
  startLoc: TokenLocation,
  isConst: boolean,
  modifiers?: string[],
): VariableDeclaration {
  const nameToken = parser.expect("identifier", "<variable-name>");
  const name = nameToken?.value ?? "";
  let type: TypeReference | undefined;
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
  } else if (isArraySugar && type) {
    initializer = {
      kind: "ObjectCreationExpression",
      type,
      arguments: [],
      loc: type.loc,
    };
  } else if (hasAsNew && type) {
    initializer = {
      kind: "ObjectCreationExpression",
      type: type,
      arguments: asNewArguments,
      loc: type.loc,
    };
  }
  const declaration: VariableDeclaration = {
    kind: "VariableDeclaration",
    name,
    type,
    initializer,
    isConst,
    isArraySugar,
    loc: locOf(startLoc),
  };
  if (modifiers !== undefined) {
    (declaration as any).modifiers = modifiers;
  }
  if (nativeArrayDimensions !== undefined) {
    declaration.nativeArrayDimensions = nativeArrayDimensions;
  }
  return declaration;
}

export function parseLocalVariableDeclarationAfterDim(
  parser: Parser,
  startLoc: TokenLocation,
  isConst: boolean,
  modifiers?: string[],
): Statement {
  const first = parseSingleVariableDeclaration(parser, startLoc, isConst, modifiers);

  if (parser.match("punct", ",")) {
    const decls: Statement[] = [first];
    while (parser.consume("punct", ",")) {
      const nextStartLoc = parser.peek().loc;
      const nextDecl = parseSingleVariableDeclaration(parser, nextStartLoc, isConst, modifiers);
      decls.push(nextDecl);
    }
    const comment = parser.skipToEndOfLine();
    return {
      kind: "Block",
      statements: decls,
      comment,
      loc: locOf(startLoc, parser.peek().loc),
    };
  } else {
    const comment = parser.skipToEndOfLine();
    first.comment = comment;
    return first;
  }
}
