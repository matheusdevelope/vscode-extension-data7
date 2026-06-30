import type { MethodDeclaration, Statement, TypeReference } from "../../ast/ast";
import { Parser, locOf } from "../parser";
import type { TokenLocation } from "../token-types";

export function parseMethod(parser: Parser): MethodDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  const head = parser.advance(); // 'Sub' | 'Function'
  const isFunction = Parser.eq(head, "function");

  const nameToken = parser.consumeNameToken();
  if (!nameToken) {
    parser.recordError(
      "expected-token",
      `Expected '<method-name>', got '${parser.peek().value || parser.peek().kind}'.`,
      parser.peek().loc,
    );
  }
  const name = nameToken?.value ?? "";
  const isConstructor = name.toLowerCase() === "new";
  const typeParameters = parser.parseOptionalTypeParameters();
  const { params: parameters, hasParentheses } = parser.parseParameterList();
  let returnType: TypeReference | undefined;
  if (isFunction && (parser.consume("keyword", "as") || parser.consume("identifier", "as"))) {
    const t = parser.parseTypeReference();
    if (t !== null) returnType = t;
  }
  parser.skipToEndOfLine();

  const endKind = isFunction ? "function" : "sub";
  const { stmts: body, endLoc } = parseMethodBody(parser, endKind, startLoc);
  const decl: MethodDeclaration = {
    kind: "MethodDeclaration",
    name,
    typeParameters,
    parameters,
    body,
    loc: locOf(startLoc, endLoc),
    modifiers,
    noParentheses: !hasParentheses,
  };
  if (isConstructor) decl.isConstructor = true;
  if (returnType !== undefined) decl.returnType = returnType;
  return decl;
}

export function parseMethodBody(
  parser: Parser,
  endKind: "sub" | "function" | "get" | "set",
  startLoc: TokenLocation,
): { stmts: Statement[]; endLoc?: TokenLocation } {
  const stmts: Statement[] = [];
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd(endKind)) {
      const endLoc = parser.consumeEnd(endKind);
      parser.skipToEndOfLine();
      return { stmts, endLoc };
    }
    const s = parser.parseStatement();
    if (s !== null) stmts.push(s);
    parser.skipStatementSeparator();
  }
  const endLabel =
    endKind === "sub"
      ? "Sub"
      : endKind === "function"
        ? "Function"
        : endKind === "get"
          ? "Get"
          : "Set";
  parser.recordError("unterminated-block", `Method body is missing 'End ${endLabel}'.`, startLoc);
  return { stmts };
}
