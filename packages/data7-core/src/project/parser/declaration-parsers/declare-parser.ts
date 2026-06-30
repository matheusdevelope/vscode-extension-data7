import type {
  MethodDeclaration,
  ParameterDeclaration,
  SourceLocation,
  TypeReference,
} from "../../ast/ast";
import { Parser, locOf } from "../parser";

/**
 * Parses DLL / API Declare statements:
 * `Declare Sub Sleep Lib "kernel32.dll" (dwMilliseconds As Long)`
 * `Private Declare Function GetActiveWindow Lib "user32.dll" As Long`
 */
export function parseDeclareDeclaration(parser: Parser): MethodDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();

  // Add "declare" modifier to denote this is a DLL Declare statement
  modifiers.push("declare");

  parser.advance(); // consume 'Declare'

  const kindToken = parser.advance(); // 'Sub' | 'Function'
  const isFunction = Parser.eq(kindToken, "function");

  const nameToken = parser.expect("identifier", "<declare-name>");
  const name = nameToken?.value ?? "";

  let declareNameParenthesesLoc: SourceLocation | undefined;
  if (
    parser.match("punct", "(") &&
    parser.peek(1).kind === "punct" &&
    parser.peek(1).value === ")"
  ) {
    const openToken = parser.advance();
    const closeToken = parser.advance();
    declareNameParenthesesLoc = {
      startLine: openToken.loc.line,
      startChar: openToken.loc.column,
      endLine: closeToken.loc.line,
      endChar: closeToken.loc.column + 1,
    };
  }

  // Expect 'Lib' keyword
  const libToken = parser.advance();
  if (!Parser.eq(libToken, "lib")) {
    parser.recordError(
      "expected-token",
      `Expected 'Lib' keyword after declare name, got '${libToken.value || libToken.kind}'.`,
      libToken.loc,
    );
  }

  const libStringToken = parser.expect("string", "<lib-name>");
  const libName = libStringToken ? libStringToken.value.replace(/^"|"$/g, "") : "";

  let aliasName: string | undefined;
  if (Parser.eq(parser.peek(), "alias")) {
    parser.advance(); // consume 'Alias'
    const aliasStringToken = parser.expect("string", "<alias-name>");
    aliasName = aliasStringToken ? aliasStringToken.value.replace(/^"|"$/g, "") : "";
  }

  let parameters: ParameterDeclaration[] = [];
  let hasParentheses = false;
  if (parser.match("punct", "(")) {
    const parsed = parser.parseParameterList();
    parameters = parsed.params;
    hasParentheses = parsed.hasParentheses;
  }

  let returnType: TypeReference | undefined;
  if (isFunction && (parser.consume("keyword", "as") || parser.consume("identifier", "as"))) {
    const t = parser.parseTypeReference();
    if (t !== null) returnType = t;
  }

  const comment = parser.skipToEndOfLine();

  const decl: MethodDeclaration = {
    kind: "MethodDeclaration",
    name,
    typeParameters: [],
    parameters,
    body: [], // DLL methods do not have a body
    loc: locOf(startLoc, parser.peek().loc),
    modifiers,
    noParentheses: !hasParentheses,
    libName,
    aliasName,
    comment,
    ...(declareNameParenthesesLoc ? { declareNameParenthesesLoc } : {}),
  };

  if (returnType !== undefined) decl.returnType = returnType;
  return decl;
}
