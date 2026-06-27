/** Expression grammar for the recursive-descent parser.
 *
 * Keeping Pratt parsing here makes `Parser` responsible for cursor and
 * declaration orchestration only. The functions deliberately receive the
 * parser instance so plugins continue to observe the same public API.
 */
import type { Expression, SourceLocation, TypeReference } from "../ast/ast";
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
    const value = token.value.includes(".") ? parseFloat(token.value) : parseInt(token.value);
    return { kind: "Literal", value: isNaN(value) ? token.value : value, loc: locOf(token.loc) };
  }
  if (token.kind === "string") {
    parser.advance();
    return { kind: "Literal", value: token.value, loc: locOf(token.loc) };
  }
  if (token.kind === "identifier" || token.kind === "keyword") {
    if (parser.isGenericTypeArgumentsLookahead()) {
      const type = parser.parseTypeReference(false);
      if (type !== null) {
        return { kind: "TypeReferenceExpression", type, loc: locOf(token.loc, parser.peek().loc) };
      }
    }
    const lower = token.value.toLowerCase();
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
      loc: locOf(token.loc),
    };
  }
  return null;
}

export function parseInfix(parser: Parser, left: Expression, token: Token): Expression | null {
  for (const plugin of parser.plugins) {
    const result = plugin.parseExpressionInfix?.(parser, left, token);
    if (result !== null && result !== undefined) return result;
  }
  if (token.kind === "punct" && token.value === "(") {
    const arguments_ = parseArgumentList(parser, false);
    if (left.kind === "MemberAccess") {
      return {
        kind: "MethodInvocation",
        callee: left.target,
        methodName: left.member,
        typeArguments: [],
        arguments: arguments_,
        loc: left.loc,
      };
    }
    if (left.kind === "Identifier") {
      return {
        kind: "MethodInvocation",
        methodName: left.name,
        typeArguments: [],
        arguments: arguments_,
        loc: left.loc,
      };
    }
    return {
      kind: "MethodInvocation",
      callee: left,
      methodName: "",
      typeArguments: [],
      arguments: arguments_,
      loc: left.loc,
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
    const index = indices[0] ?? { kind: "Identifier", name: "", loc: left.loc };
    return { kind: "ArrayAccessExpression", target: left, index, indices, loc: left.loc };
  }
  if (token.kind === "punct" && token.value === ".") {
    parser.advance();
    const memberToken = parser.consume("identifier") ?? parser.consume("keyword");
    if (!memberToken) {
      parser.recordError(
        "expected-token",
        `Expected '<member-name>', got '${parser.peek().value || parser.peek().kind}'.`,
        parser.peek().loc,
      );
    }
    const typeArguments: TypeReference[] = [];
    if (parser.isGenericTypeArgumentsLookahead()) {
      for (const plugin of parser.plugins) {
        const result = plugin.parseTypeArguments?.(parser);
        if (result !== null && result !== undefined) {
          typeArguments.push(...result);
          break;
        }
      }
    }
    const member = memberToken?.value ?? "";
    if (typeArguments.length > 0) {
      return {
        kind: "MethodInvocation",
        callee: left,
        methodName: member,
        typeArguments,
        arguments: [],
        loc: left.loc,
      };
    }
    return { kind: "MemberAccess", target: left, member, loc: left.loc };
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
  while (!parser.match("punct", ")") && !parser.isEOF()) {
    arguments_.push(parseExpression(parser));
    if (!parser.consume("punct", ",")) break;
  }
  parser.expect("punct", ")", { literal: true });
  return arguments_;
}
