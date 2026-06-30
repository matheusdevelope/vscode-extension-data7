import type {
  MethodDeclaration,
  ParameterDeclaration,
  PropertyDeclaration,
  TypeReference,
} from "../../ast/ast";
import { Parser, locOf, emptyTypeReference } from "../parser";
import type { TokenLocation } from "../token-types";
import { parseMethodBody } from "./method-parser";

export function parseProperty(parser: Parser): PropertyDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  parser.advance(); // 'Property'
  const nameToken = parser.expectNameToken("<property-name>");
  const name = nameToken?.value ?? "";
  let params: ParameterDeclaration[] | undefined;
  if (parser.match("punct", "(")) {
    const parsed = parser.parseParameterList();
    params = parsed.params;
  }
  let type: TypeReference = emptyTypeReference();
  if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
    const t = parser.parseTypeReference();
    if (t !== null) type = t;
  }
  parser.skipToEndOfLine();

  let getter: MethodDeclaration | undefined;
  let setter: MethodDeclaration | undefined;

  // Lookahead to check if the property has a block
  let lookahead = 0;
  let nextToken = parser.peek(lookahead);
  while (
    nextToken.kind === "newline" ||
    nextToken.kind === "comment" ||
    parser.peekIsModifier(lookahead)
  ) {
    lookahead++;
    nextToken = parser.peek(lookahead);
  }

  let hasBlock = false;
  if (nextToken.kind === "identifier" || nextToken.kind === "keyword") {
    const v = nextToken.value.toLowerCase();
    if (v === "get" || v === "set") {
      hasBlock = true;
    } else if (v === "end" && parser.eq(parser.peek(lookahead + 1), "property")) {
      hasBlock = true;
    }
  }

  let endLoc: TokenLocation | undefined;
  if (hasBlock) {
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("property")) {
        endLoc = parser.consumeEnd("property");
        parser.skipToEndOfLine();
        break;
      }

      const getSetModifiers = parser.parseModifiers();
      const head = parser.peek();
      if (head.kind === "identifier" || head.kind === "keyword") {
        const v = head.value.toLowerCase();
        if (v === "get") {
          const getStartLoc = head.loc;
          parser.advance(); // consume Get
          parser.skipToEndOfLine();
          const { stmts: body, endLoc: getEndLoc } = parseMethodBody(parser, "get", getStartLoc);
          getter = {
            kind: "MethodDeclaration",
            name: "Get",
            typeParameters: [],
            parameters: [],
            body,
            loc: locOf(getStartLoc, getEndLoc),
            modifiers: getSetModifiers,
            noParentheses: true,
          };
          continue;
        } else if (v === "set") {
          const setStartLoc = head.loc;
          parser.advance(); // consume Set
          const { params: setParams, hasParentheses } = parser.parseParameterList();
          parser.skipToEndOfLine();
          const { stmts: body, endLoc: setEndLoc } = parseMethodBody(parser, "set", setStartLoc);
          setter = {
            kind: "MethodDeclaration",
            name: "Set",
            typeParameters: [],
            parameters: setParams,
            body,
            loc: locOf(setStartLoc, setEndLoc),
            modifiers: getSetModifiers,
            noParentheses: !hasParentheses,
          };
          continue;
        }
      }

      parser.parseStatement();
      parser.skipStatementSeparator();
    }
  }

  const decl: PropertyDeclaration = {
    kind: "PropertyDeclaration",
    name,
    type,
    loc: locOf(startLoc, endLoc),
    modifiers,
    getter,
    setter,
    hasBlock,
    parameters: params,
  };

  return decl;
}
