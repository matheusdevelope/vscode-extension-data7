import type { DelegateDeclaration, TypeReference } from "../../ast/ast";
import { Parser, locOf } from "../parser";

export function parseDelegate(parser: Parser): DelegateDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  parser.advance(); // 'Delegate'
  const kindToken = parser.advance(); // 'Sub' | 'Function'
  const isFunction = Parser.eq(kindToken, "function");
  const nameToken = parser.expect("identifier", "<delegate-name>");
  const name = nameToken?.value ?? "";
  const typeParameters = parser.parseOptionalTypeParameters();
  const { params: parameters, hasParentheses } = parser.parseParameterList();
  let returnType: TypeReference | undefined;
  if (isFunction && (parser.consume("keyword", "as") || parser.consume("identifier", "as"))) {
    const t = parser.parseTypeReference();
    if (t !== null) returnType = t;
  }
  parser.skipToEndOfLine();
  const decl: DelegateDeclaration = {
    kind: "DelegateDeclaration",
    name,
    typeParameters,
    parameters,
    loc: locOf(startLoc),
    modifiers,
    noParentheses: !hasParentheses,
  };
  if (returnType !== undefined) decl.returnType = returnType;
  return decl;
}
