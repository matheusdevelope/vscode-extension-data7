import type {
  Expression,
  ForEachStatement,
  ForStatement,
  Identifier,
  IfStatement,
  Statement,
  SourceLocation,
  TryCatchStatement,
  TypeReference,
  WhileStatement,
} from "../ast/ast";
import type { Token, TokenLocation } from "./token-types";
import type { Precedence } from "./parser";

/** Public parser operations required by control-flow parsers. */
export interface StatementParserHost {
  peek(offset?: number): Token;
  isEOF(): boolean;
  advance(): Token;
  skipNewlines(): void;
  eq(token: Token, name: string): boolean;
  match(kind: Token["kind"], value?: string): boolean;
  consume(kind: Token["kind"], value?: string): Token | null;
  expect(
    kind: Token["kind"],
    valueOrDescription: string,
    options?: { readonly literal?: boolean },
  ): Token | null;
  recordError(
    code: "expected-token" | "unterminated-block",
    message: string,
    loc: TokenLocation,
  ): void;
  parseExpression(precedence?: Precedence): Expression;
  parseTypeReference(swallowArrayMarker?: boolean): TypeReference | null;
  parseStatement(): Statement | null;
  skipStatementSeparator(): void;
  matchEnd(kind: string): boolean;
  consumeEnd(kind: string): TokenLocation;
  skipToEndOfLine(): string | undefined;
}

export function parseIfStatement(parser: StatementParserHost): IfStatement {
  const startLoc = parser.peek().loc;
  parser.advance();
  const condition = parser.parseExpression();
  const hasThen =
    parser.consume("keyword", "then") !== null || parser.consume("identifier", "then") !== null;
  const nextToken = parser.peek();
  if (
    !hasThen &&
    nextToken.kind !== "newline" &&
    nextToken.kind !== "eof" &&
    nextToken.kind !== "comment"
  ) {
    parser.expect("keyword", "then", { literal: true });
  }
  const isSingleLine =
    nextToken.loc.line === startLoc.line &&
    nextToken.kind !== "newline" &&
    nextToken.kind !== "eof" &&
    nextToken.kind !== "comment";
  const thenBranch: Statement[] = [];
  const elseIfBranches: IfStatement["elseIfBranches"] = [];
  let elseBranch: Statement[] | undefined;

  if (isSingleLine) {
    while (parser.peek().loc.line === startLoc.line && !parser.isEOF()) {
      const token = parser.peek();
      if ((token.kind === "keyword" || token.kind === "identifier") && parser.eq(token, "else")) {
        break;
      }
      if (token.kind === "punct" && token.value === ":") {
        parser.advance();
        continue;
      }
      if (token.kind === "newline") break;
      const statement = parser.parseStatement();
      if (statement !== null) thenBranch.push(statement);
    }
    const next = parser.peek();
    if (
      next.loc.line === startLoc.line &&
      (next.kind === "keyword" || next.kind === "identifier") &&
      parser.eq(next, "else")
    ) {
      parser.advance();
      elseBranch = [];
      while (parser.peek().loc.line === startLoc.line && !parser.isEOF()) {
        const token = parser.peek();
        if (token.kind === "punct" && token.value === ":") {
          parser.advance();
          continue;
        }
        if (token.kind === "newline") break;
        const statement = parser.parseStatement();
        if (statement !== null) elseBranch.push(statement);
      }
    }
    if (parser.peek().loc.line === startLoc.line) parser.skipToEndOfLine();
    return {
      kind: "IfStatement",
      condition,
      thenBranch,
      elseIfBranches: [],
      elseBranch,
      loc: locOf(startLoc),
      singleLine: true,
      hasThen,
    };
  }

  parser.skipToEndOfLine();
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd("if")) {
      endLoc = parser.consumeEnd("if");
      parser.skipToEndOfLine();
      break;
    }
    if (isElseIf(parser)) {
      const elseIfStart = parser.peek().loc;
      const wasElseIfSeparated = parser.eq(parser.peek(), "else");
      consumeElseIf(parser);
      const elseIfCond = parser.parseExpression();
      const hasThenElseIf =
        parser.consume("keyword", "then") !== null || parser.consume("identifier", "then") !== null;
      if (
        !hasThenElseIf &&
        parser.peek().kind !== "newline" &&
        parser.peek().kind !== "eof" &&
        parser.peek().kind !== "comment"
      ) {
        parser.expect("keyword", "then", { literal: true });
      }
      parser.skipToEndOfLine();
      const elseIfBody: Statement[] = [];
      while (!parser.isEOF()) {
        parser.skipNewlines();
        if (isElseIfOrElseOrEndIf(parser)) break;
        const statement = parser.parseStatement();
        if (statement !== null) elseIfBody.push(statement);
        parser.skipStatementSeparator();
      }
      elseIfBranches.push({
        condition: elseIfCond,
        body: elseIfBody,
        hasThen: hasThenElseIf,
        hasSpace: wasElseIfSeparated,
        loc: locOf(elseIfStart),
      });
      continue;
    }
    const head = parser.peek();
    if ((head.kind === "keyword" || head.kind === "identifier") && parser.eq(head, "else")) {
      parser.advance();
      parser.skipToEndOfLine();
      elseBranch = [];
      while (!parser.isEOF()) {
        parser.skipNewlines();
        if (parser.matchEnd("if")) break;
        const statement = parser.parseStatement();
        if (statement !== null) elseBranch.push(statement);
        parser.skipStatementSeparator();
      }
      continue;
    }
    const statement = parser.parseStatement();
    if (statement !== null) thenBranch.push(statement);
    parser.skipStatementSeparator();
  }
  return {
    kind: "IfStatement",
    condition,
    thenBranch,
    elseIfBranches,
    elseBranch,
    loc: locOf(startLoc, endLoc),
    hasThen,
  };
}

export function parseForOrForEachStatement(
  parser: StatementParserHost,
): ForStatement | ForEachStatement {
  const startLoc = parser.peek().loc;
  parser.advance();
  const nextToken = parser.peek();
  if (
    (nextToken.kind === "keyword" || nextToken.kind === "identifier") &&
    parser.eq(nextToken, "each")
  ) {
    parser.advance();
    const elementVarToken = parser.expect("identifier", "<loop-variable>");
    const elementVar: Identifier = {
      kind: "Identifier",
      name: elementVarToken?.value ?? "",
      loc: locOf(elementVarToken?.loc ?? startLoc),
    };
    let elementType: TypeReference | undefined;
    if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
      elementType = parser.parseTypeReference() ?? undefined;
    }
    parser.expect("keyword", "in", { literal: true });
    const enumerable = parser.parseExpression();
    const comment = parser.skipToEndOfLine();
    const { body, endLoc } = parseForBody(parser);
    return {
      kind: "ForEachStatement",
      elementVar,
      elementType,
      enumerable,
      body,
      loc: locOf(startLoc, endLoc),
      comment,
    };
  }
  const counterToken = parser.expect("identifier", "<loop-variable>");
  const counter: Identifier = {
    kind: "Identifier",
    name: counterToken?.value ?? "",
    loc: locOf(counterToken?.loc ?? startLoc),
  };
  parser.expect("punct", "=", { literal: true });
  const start = parser.parseExpression();
  parser.expect("keyword", "to", { literal: true });
  const end = parser.parseExpression();
  let step: Expression | undefined;
  if (parser.consume("keyword", "step") || parser.consume("identifier", "step")) {
    step = parser.parseExpression();
  }
  const comment = parser.skipToEndOfLine();
  const { body, endLoc } = parseForBody(parser);
  return {
    kind: "ForStatement",
    counter,
    start,
    end,
    step,
    body,
    loc: locOf(startLoc, endLoc),
    comment,
  };
}

export function parseWhileStatement(parser: StatementParserHost): WhileStatement {
  const startLoc = parser.peek().loc;
  parser.advance();
  const condition = parser.parseExpression();
  parser.skipToEndOfLine();
  const body: Statement[] = [];
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (
      parser.matchEnd("while") ||
      parser.match("keyword", "wend") ||
      parser.match("identifier", "wend")
    ) {
      endLoc = parser.matchEnd("while") ? parser.consumeEnd("while") : parser.advance().loc;
      parser.skipToEndOfLine();
      break;
    }
    const statement = parser.parseStatement();
    if (statement !== null) body.push(statement);
    parser.skipStatementSeparator();
  }
  return { kind: "WhileStatement", condition, body, loc: locOf(startLoc, endLoc) };
}

export function parseDoLoopStatement(parser: StatementParserHost): WhileStatement {
  const startLoc = parser.peek().loc;
  parser.advance();
  let condition: Expression | undefined;
  let isUntil = false;
  const nextToken = parser.peek();
  if (
    (nextToken.kind === "keyword" || nextToken.kind === "identifier") &&
    (parser.eq(nextToken, "while") || parser.eq(nextToken, "until"))
  ) {
    isUntil = parser.eq(nextToken, "until");
    parser.advance();
    condition = parser.parseExpression();
  }
  parser.skipToEndOfLine();
  const body: Statement[] = [];
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.match("keyword", "loop") || parser.match("identifier", "loop")) {
      endLoc = parser.advance().loc;
      const tailToken = parser.peek();
      if (
        (tailToken.kind === "keyword" || tailToken.kind === "identifier") &&
        (parser.eq(tailToken, "while") || parser.eq(tailToken, "until"))
      ) {
        isUntil = parser.eq(tailToken, "until");
        parser.advance();
        condition = parser.parseExpression();
        if (condition.loc) endLoc = { line: condition.loc.endLine, column: condition.loc.endChar };
      }
      parser.skipToEndOfLine();
      break;
    }
    const statement = parser.parseStatement();
    if (statement !== null) body.push(statement);
    parser.skipStatementSeparator();
  }
  let finalCondition = condition ?? { kind: "Literal" as const, value: true, loc: locOf(startLoc) };
  if (isUntil) {
    finalCondition = {
      kind: "UnaryExpression",
      operator: "Not",
      argument: finalCondition,
      loc: finalCondition.loc,
    };
  }
  return { kind: "WhileStatement", condition: finalCondition, body, loc: locOf(startLoc, endLoc) };
}

export function parseTryCatchStatement(parser: StatementParserHost): TryCatchStatement {
  const startLoc = parser.peek().loc;
  parser.advance();
  parser.skipToEndOfLine();
  const tryBody: Statement[] = [];
  let catchVar: Identifier | undefined;
  let catchType: TypeReference | undefined;
  const catchBody: Statement[] = [];
  let finallyBody: Statement[] | undefined;
  let currentBlock: "try" | "catch" | "finally" = "try";
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd("try")) {
      endLoc = parser.consumeEnd("try");
      parser.skipToEndOfLine();
      break;
    }
    const head = parser.peek();
    if ((head.kind === "keyword" || head.kind === "identifier") && parser.eq(head, "catch")) {
      parser.advance();
      currentBlock = "catch";
      if (parser.peek().kind === "identifier") {
        const variableToken = parser.advance();
        catchVar = { kind: "Identifier", name: variableToken.value, loc: locOf(variableToken.loc) };
        if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
          catchType = parser.parseTypeReference() ?? undefined;
        }
      }
      parser.skipToEndOfLine();
      continue;
    }
    if ((head.kind === "keyword" || head.kind === "identifier") && parser.eq(head, "finally")) {
      parser.advance();
      currentBlock = "finally";
      finallyBody = [];
      parser.skipToEndOfLine();
      continue;
    }
    const statement = parser.parseStatement();
    if (statement !== null) {
      if (currentBlock === "try") tryBody.push(statement);
      else if (currentBlock === "catch") catchBody.push(statement);
      else if (finallyBody) finallyBody.push(statement);
    }
    parser.skipStatementSeparator();
  }
  return {
    kind: "TryCatchStatement",
    tryBody,
    catchVar,
    catchType,
    catchBody,
    finallyBody,
    loc: locOf(startLoc, endLoc),
  };
}

function parseForBody(parser: StatementParserHost): { body: Statement[]; endLoc?: TokenLocation } {
  const body: Statement[] = [];
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd("for") || matchesNext(parser)) {
      endLoc = consumeNext(parser);
      parser.skipToEndOfLine();
      break;
    }
    const statement = parser.parseStatement();
    if (statement !== null) body.push(statement);
    parser.skipStatementSeparator();
  }
  return { body, endLoc };
}

function matchesNext(parser: StatementParserHost): boolean {
  return parser.match("keyword", "next") || parser.match("identifier", "next");
}

function consumeNext(parser: StatementParserHost): TokenLocation {
  const nextKeyword = parser.advance();
  let lastLoc = nextKeyword.loc;
  if (nextKeyword.value.toLowerCase() === "end") {
    if (parser.peek().value.toLowerCase() === "for") lastLoc = parser.advance().loc;
  } else if (parser.peek().kind === "identifier") {
    lastLoc = parser.advance().loc;
  }
  return lastLoc;
}

function isElseIfOrElseOrEndIf(parser: StatementParserHost): boolean {
  const head = parser.peek();
  if (head.kind !== "keyword" && head.kind !== "identifier") return false;
  const value = head.value.toLowerCase();
  return (
    isElseIf(parser) || value === "else" || (value === "end" && parser.eq(parser.peek(1), "if"))
  );
}

function isElseIf(parser: StatementParserHost): boolean {
  const head = parser.peek();
  if (head.kind !== "keyword" && head.kind !== "identifier") return false;
  if (parser.eq(head, "elseif")) return true;
  const next = parser.peek(1);
  return (
    parser.eq(head, "else") &&
    next.loc.line === head.loc.line &&
    (next.kind === "keyword" || next.kind === "identifier") &&
    parser.eq(next, "if")
  );
}

function consumeElseIf(parser: StatementParserHost): void {
  const head = parser.advance();
  if (parser.eq(head, "else")) parser.advance();
}

function locOf(loc: TokenLocation, endLoc?: TokenLocation): SourceLocation {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}
