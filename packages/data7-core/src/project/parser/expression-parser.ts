/** Expression grammar for the recursive-descent parser.
 *
 * Keeping Pratt parsing here makes `Parser` responsible for cursor and
 * declaration orchestration only. The functions deliberately receive the
 * parser instance so plugins continue to observe the same public API.
 */
import type { Expression, SourceLocation, Statement, TypeReference } from "../ast/ast";
import type { Parser } from "./parser";
import type { Token, TokenLocation } from "./token-types";
import { Precedence, PRECEDENCES } from "./parser";

function locOf(loc: TokenLocation, endLoc?: TokenLocation): SourceLocation {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}

function locFromExpressionToToken(
  start: Expression,
  endToken: Token,
  width = endToken.value.length,
): SourceLocation {
  const startLoc = start.loc;
  return {
    startLine: startLoc?.startLine ?? endToken.loc.line,
    startChar: startLoc?.startChar ?? endToken.loc.column,
    endLine: endToken.loc.line,
    endChar: endToken.loc.column + Math.max(1, width),
  };
}

function previousToken(parser: Parser): Token | undefined {
  return parser.tokens[parser.pos - 1];
}

function skipNewlinesAfterDotForContinuation(parser: Parser): void {
  if (parser.peek().kind !== "newline") return;
  let offset = 0;
  while (parser.peek(offset).kind === "newline") offset++;
  const next = parser.peek(offset);
  const value = next.value.toLowerCase();
  if (
    next.kind === "eof" ||
    (next.kind === "keyword" &&
      (value === "end" ||
        value === "else" ||
        value === "elseif" ||
        value === "catch" ||
        value === "finally"))
  ) {
    return;
  }
  parser.skipNewlines();
}

function precedenceOf(token: Token): Precedence {
  if (token.kind === "punct" && ["(", "[", "."].includes(token.value)) return Precedence.Call;
  if (token.kind === "punct" && token.value === "?.") return Precedence.OptionalChain;
  if (token.kind === "keyword" || token.kind === "identifier" || token.kind === "punct") {
    return PRECEDENCES[token.value.toLowerCase()] ?? Precedence.None;
  }
  return Precedence.None;
}

export function parseExpressionWithLeft(
  parser: Parser,
  left: Expression,
  precedence = Precedence.None,
): Expression {
  let currentLeft = left;
  while (precedence < precedenceOf(parser.peek())) {
    const updatedLeft = parseInfix(parser, currentLeft, parser.peek());
    if (updatedLeft === null) break;
    currentLeft = updatedLeft;
  }
  return currentLeft;
}

export function parseExpression(parser: Parser, precedence = Precedence.None): Expression {
  const left = parsePrefix(parser);
  if (left === null) {
    const errLoc = parser.peek().loc;
    parser.recordError(
      "expected-token",
      `Expected an expression, got '${parser.peek().value || parser.peek().kind}'.`,
      errLoc,
    );
    parser.advance();
    return { kind: "Identifier", name: "", loc: locOf(errLoc) };
  }
  return parseExpressionWithLeft(parser, left, precedence);
}

export function parsePrefix(parser: Parser): Expression | null {
  for (const plugin of parser.plugins) {
    const result = plugin.parseExpressionPrefix?.(parser);
    if (result !== null && result !== undefined) return result;
  }
  const token = parser.peek();
  if (token.kind === "number") {
    parser.advance();
    const normalized = token.value.replace(/_/g, "");
    const value =
      normalized.includes(".") || /e/i.test(normalized)
        ? Number.parseFloat(normalized)
        : Number.parseInt(normalized, 10);
    return { kind: "Literal", value: isNaN(value) ? token.value : value, loc: locOf(token.loc) };
  }
  if (token.kind === "string") {
    parser.advance();
    return { kind: "Literal", value: token.value, loc: locOf(token.loc) };
  }
  if (token.kind === "identifier" || token.kind === "keyword") {
    const lower = token.value.toLowerCase();
    if (lower === "function" || lower === "sub") {
      return parseLambdaExpression(parser);
    }
    if (parser.isGenericTypeArgumentsLookahead()) {
      const type = parser.parseTypeReference(false);
      if (type !== null) {
        return { kind: "TypeReferenceExpression", type, loc: locOf(token.loc, parser.peek().loc) };
      }
    }
    if (lower === "typeof") {
      parser.advance();
      const checkedExpr = parseExpression(parser, Precedence.Comparison);
      parser.expect("keyword", "is", { literal: true });
      const type = parser.parseTypeReference(false) ?? {
        kind: "TypeReference",
        name: "",
        typeArguments: [],
        loc: locOf(token.loc),
      };
      return {
        kind: "MethodInvocation",
        methodName: "TypeOf",
        typeArguments: [],
        arguments: [checkedExpr, { kind: "TypeReferenceExpression", type, loc: type.loc }],
        loc: locOf(token.loc),
      };
    }
    if (lower === "true" || lower === "false") {
      parser.advance();
      return { kind: "Literal", value: lower === "true", loc: locOf(token.loc) };
    }
    if (lower === "null" || lower === "nothing") {
      parser.advance();
      return { kind: "Literal", value: null, loc: locOf(token.loc) };
    }
    if (lower === "not" || token.value === "!") {
      parser.advance();
      return {
        kind: "UnaryExpression",
        operator: "Not",
        argument: parseExpression(parser, Precedence.Unary),
        loc: locOf(token.loc),
      };
    }
    if (lower === "new") {
      parser.advance();
      const type = parser.parseTypeReference(false) ?? {
        kind: "TypeReference",
        name: "",
        typeArguments: [],
        loc: locOf(token.loc),
      };
      const hasParentheses = parser.match("punct", "(");
      const args = hasParentheses ? parseArgumentList(parser, true) : [];
      return {
        kind: "ObjectCreationExpression",
        type,
        arguments: args,
        noParentheses: !hasParentheses,
        loc: locOf(token.loc),
      };
    }
    parser.advance();
    return { kind: "Identifier", name: token.value, loc: locOf(token.loc) };
  }
  if (token.kind === "punct" && token.value === "-") {
    parser.advance();
    return {
      kind: "UnaryExpression",
      operator: "-",
      argument: parseExpression(parser, Precedence.Unary),
      loc: locOf(token.loc),
    };
  }
  if (token.kind === "punct" && token.value === "(") {
    parser.advance();
    const expression = parseExpression(parser);
    parser.expect("punct", ")", { literal: true });
    expression.parenthesized = true;
    return expression;
  }
  if (token.kind === "punct" && token.value === ".") {
    parser.advance();
    skipNewlinesAfterDotForContinuation(parser);
    const memberToken = parser.consume("identifier") ?? parser.consume("keyword");
    if (!memberToken) {
      parser.recordError(
        "expected-token",
        `Expected '<member-name>', got '${parser.peek().value || parser.peek().kind}'.`,
        parser.peek().loc,
      );
    }
    return {
      kind: "MemberAccess",
      target: { kind: "Identifier", name: "", loc: locOf(token.loc) },
      member: memberToken?.value ?? "",
      memberLoc: memberToken ? locOf(memberToken.loc) : undefined,
      loc: locOf(token.loc),
    };
  }
  return null;
}

function parseLambdaExpression(parser: Parser): Expression {
  const startToken = parser.advance();
  const isFunction = startToken.value.toLowerCase() === "function";
  const { params: parameters } = parser.parseParameterList();
  let returnType: TypeReference | undefined;
  if (isFunction && (parser.consume("keyword", "as") || parser.consume("identifier", "as"))) {
    returnType = parser.parseTypeReference() ?? undefined;
  }

  const next = parser.peek();
  const shouldParseBlock =
    next.kind === "newline" ||
    (next.kind === "keyword" && next.value.toLowerCase() === "return") ||
    (next.kind === "identifier" && next.value.toLowerCase() === "return");

  let body: Expression | Statement[];
  if (!shouldParseBlock) {
    body = parser.parseExpression();
    const expressionLoc = body.loc;
    return {
      kind: "ArrowFunctionExpression",
      lambdaKind: isFunction ? "Function" : "Sub",
      parameters,
      body,
      returnType,
      loc: locOf(
        startToken.loc,
        expressionLoc
          ? { line: expressionLoc.endLine, column: expressionLoc.endChar }
          : parser.peek().loc,
      ),
    };
  }

  parser.consume("newline");
  const statements = parseLambdaBody(parser, isFunction ? "function" : "sub", startToken.loc);
  body = statements.body;
  return {
    kind: "ArrowFunctionExpression",
    lambdaKind: isFunction ? "Function" : "Sub",
    parameters,
    body,
    returnType,
    loc: locOf(startToken.loc, statements.endLoc),
  };
}

function parseLambdaBody(
  parser: Parser,
  endKind: "function" | "sub",
  startLoc: TokenLocation,
): { readonly body: Statement[]; readonly endLoc?: TokenLocation } {
  const body: Statement[] = [];
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd(endKind)) {
      const endLoc = parser.consumeEnd(endKind);
      parser.consume("newline");
      return { body, endLoc };
    }
    const statement = parser.parseStatement();
    if (statement !== null) body.push(statement);
    parser.skipStatementSeparator();
  }
  parser.recordError(
    "unterminated-block",
    `Lambda body is missing 'End ${endKind === "function" ? "Function" : "Sub"}'.`,
    startLoc,
  );
  return { body };
}

export function parseInfix(parser: Parser, left: Expression, token: Token): Expression | null {
  for (const plugin of parser.plugins) {
    const result = plugin.parseExpressionInfix?.(parser, left, token);
    if (result !== null && result !== undefined) return result;
  }
  if (token.kind === "punct" && token.value === "(") {
    const arguments_ = parseArgumentList(parser, false);
    const closeToken = previousToken(parser);
    const loc =
      closeToken && closeToken.kind === "punct" && closeToken.value === ")"
        ? locFromExpressionToToken(left, closeToken, 1)
        : left.loc;
    if (left.kind === "MethodInvocation" && left.typeArguments.length > 0) {
      return {
        ...left,
        arguments: arguments_,
        loc,
      };
    }
    if (left.kind === "MemberAccess") {
      return {
        kind: "MethodInvocation",
        callee: left.target,
        methodName: left.member,
        typeArguments: [],
        arguments: arguments_,
        loc,
      };
    }
    if (left.kind === "Identifier") {
      return {
        kind: "MethodInvocation",
        methodName: left.name,
        typeArguments: [],
        arguments: arguments_,
        loc,
      };
    }
    return {
      kind: "MethodInvocation",
      callee: left,
      methodName: "",
      typeArguments: [],
      arguments: arguments_,
      loc,
    };
  }
  if (token.kind === "punct" && token.value === "[") {
    parser.advance();
    const indices: Expression[] = [];
    while (!parser.match("punct", "]") && !parser.isEOF()) {
      indices.push(parseExpression(parser));
      if (!parser.consume("punct", ",")) break;
    }
    parser.expect("punct", "]", { literal: true });
    const closeToken = previousToken(parser);
    const index = indices[0] ?? { kind: "Identifier", name: "", loc: left.loc };
    return {
      kind: "ArrayAccessExpression",
      target: left,
      index,
      indices,
      loc:
        closeToken && closeToken.kind === "punct" && closeToken.value === "]"
          ? locFromExpressionToToken(left, closeToken, 1)
          : left.loc,
    };
  }
  if (token.kind === "punct" && token.value === ".") {
    parser.advance();
    skipNewlinesAfterDotForContinuation(parser);
    const memberToken = parser.consume("identifier") ?? parser.consume("keyword");
    if (!memberToken) {
      parser.recordError(
        "expected-token",
        `Expected '<member-name>', got '${parser.peek().value || parser.peek().kind}'.`,
        parser.peek().loc,
      );
    }
    const typeArguments: TypeReference[] = [];
    if (parser.match("punct", "<") && parser.isGenericTypeArgumentsLookahead(0)) {
      for (const plugin of parser.plugins) {
        const result = plugin.parseTypeArguments?.(parser);
        if (result !== null && result !== undefined) {
          typeArguments.push(...result);
          break;
        }
      }
    }
    const member = memberToken?.value ?? "";
    const loc = memberToken
      ? locFromExpressionToToken(left, memberToken)
      : locFromExpressionToToken(left, token, 1);
    if (typeArguments.length > 0) {
      return {
        kind: "MethodInvocation",
        callee: left,
        methodName: member,
        typeArguments,
        arguments: [],
        loc,
      };
    }
    return {
      kind: "MemberAccess",
      target: left,
      member,
      memberLoc: memberToken ? locOf(memberToken.loc) : undefined,
      loc,
    };
  }
  const precedence = PRECEDENCES[token.value.toLowerCase()] ?? Precedence.None;
  if (precedence === 0) return null;
  parser.advance();
  return {
    kind: "BinaryExpression",
    left,
    operator: token.value,
    right: parseExpression(parser, precedence),
    loc: left.loc,
  };
}

function parseArgumentList(parser: Parser, requireOpening: boolean): Expression[] {
  if (requireOpening) parser.expect("punct", "(", { literal: true });
  else parser.advance();
  const arguments_: Expression[] = [];
  parser.skipNewlines();
  while (!parser.match("punct", ")") && !parser.isEOF()) {
    parser.skipNewlines();
    if (parser.match("punct", ")")) break;
    arguments_.push(parseExpression(parser));
    parser.skipNewlines();
    if (!parser.consume("punct", ",")) break;
    parser.skipNewlines();
  }
  parser.expect("punct", ")", { literal: true });
  return arguments_;
}
