import type {
  Expression,
  Statement,
  TypeReference,
  EnumDeclaration,
  UsingStatement,
  SpreadExpression,
  SourceLocation,
  ParameterDeclaration,
  Identifier,
} from "../ast/ast";
import type { Token, TokenLocation } from "./token-types";
import type { Parser } from "./parser";
import type { ParserPlugin } from "./plugin";
import { Precedence } from "./parser";
import { parseDestructuringDeclaration } from "./plugins/sugars/destructuring";
import { removeNumericSeparators } from "../sugars/plugins/numeric-separator";

function locOf(loc: TokenLocation, endLoc?: TokenLocation): SourceLocation {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}

/**
 * Detects source lines whose syntax belongs to a disabled sugar. They must be
 * preserved verbatim because the base grammar can otherwise consume a prefix
 * (for example `Return If` or `7_900`) and silently discard the remainder.
 */
export function isDisabledSugarSyntaxLine(
  sourceLine: string,
  disabledSugarIds: ReadonlySet<string>,
): boolean {
  if (disabledSugarIds.size === 0) return false;
  const code = stripStringsAndComment(sourceLine);
  const has = (id: string): boolean => disabledSugarIds.has(id);

  if (has("numeric-separator") && removeNumericSeparators(sourceLine) !== sourceLine) return true;
  if (has("return-if") && /^\s*return\s+if\b/i.test(code)) return true;
  if (
    (has("destructure-object") || has("destructure-array")) &&
    /^\s*(?:dim|const)\s*[{[]/i.test(code)
  ) {
    return true;
  }
  if (
    has("enum") &&
    /^\s*(?:(?:public|private|protected|shared|overrides|override|static|readonly)\s+)*enun\s+\w+\b/i.test(
      code,
    )
  ) {
    return true;
  }
  if (has("using") && /^\s*using\b/i.test(code)) return true;
  if (has("object-initializer") && /\bnew\b[\s\S]*\bwith\s*\{/i.test(code)) return true;
  if (has("optional-chain") && code.includes("?.")) return true;
  if (has("null-coalesce") && /\?\?=?/.test(code)) return true;
  if (has("logical-assignment") && /(?:\|\|=|&&=)/.test(code)) return true;
  if (has("pipe") && code.includes("|>")) return true;
  if (has("ternary") && /\?(?![.?])/.test(code)) return true;
  if (has("array-list") && (code.includes("=>") || code.includes("...") || code.includes("["))) {
    return true;
  }
  if (has("interpolation") && sourceLine.includes('$"')) return true;
  return has("tagged-template") && /\b[A-Za-z_]\w*\s*\$"/.test(sourceLine);
}

function stripStringsAndComment(sourceLine: string): string {
  let output = "";
  let index = 0;
  while (index < sourceLine.length) {
    const current = sourceLine[index] ?? "";
    if (current === "'") break;
    if (current === '"' || (current === "$" && sourceLine[index + 1] === '"')) {
      if (current === "$") output += " ";
      output += " ";
      index += current === "$" ? 2 : 1;
      while (index < sourceLine.length) {
        if (sourceLine[index] === '"') {
          if (sourceLine[index + 1] === '"') {
            index += 2;
            continue;
          }
          index++;
          break;
        }
        index++;
      }
      continue;
    }
    output += current;
    index++;
  }
  return output;
}

export class SugarsParserPlugin implements ParserPlugin {
  readonly name = "SugarsParserPlugin";
  private readonly enabledSugarIds?: ReadonlySet<string>;

  /**
   * Without an explicit set this remains the legacy, all-sugars parser used
   * by direct parser consumers. SugarEngine always supplies the active set.
   */
  constructor(enabledSugarIds?: Iterable<string>) {
    this.enabledSugarIds = enabledSugarIds
      ? new Set(Array.from(enabledSugarIds, (id) => id.toLowerCase()))
      : undefined;
  }

  parseStatement(parser: Parser): Statement | null {
    const head = parser.peek();
    if (head.kind !== "keyword" && head.kind !== "identifier") {
      return null;
    }

    const enunOffset = this.enunKeywordOffset(parser);
    const v = head.value.toLowerCase();
    if (enunOffset !== undefined && this.isEnabled("enum")) {
      return this.parseEnum(parser);
    }
    if (v === "using" && this.isEnabled("using")) {
      return this.parseUsing(parser);
    }
    if (v === "return" && this.isEnabled("return-if")) {
      const next = parser.peek(1);
      if (next.kind === "keyword" && next.value.toLowerCase() === "if") {
        const startLoc = parser.peek().loc;
        parser.advance(); // consume 'Return'
        parser.advance(); // consume 'If'
        const condition = parser.parseExpression();
        parser.expect("keyword", "then", { literal: true });
        const trueExpr = parser.parseExpression();
        parser.expect("keyword", "else", { literal: true });
        const falseExpr = parser.parseExpression();
        return {
          kind: "ReturnStatement",
          expression: {
            kind: "TernaryExpression",
            condition,
            trueExpr,
            falseExpr,
            loc: locOf(startLoc),
          },
          loc: locOf(startLoc),
        };
      }
    }
    return null;
  }

  parseVariableDeclaration(parser: Parser): Statement | null {
    if (!this.isEnabled("destructure-object") && !this.isEnabled("destructure-array")) {
      return null;
    }
    if (parser.match("punct", "{") && !this.isEnabled("destructure-object")) return null;
    if (parser.match("punct", "[") && !this.isEnabled("destructure-array")) return null;
    return parseDestructuringDeclaration(parser);
  }

  private isArrowFunction(parser: Parser): boolean {
    if (!parser.match("punct", "(")) return false;
    let depth = 0;
    let idx = 0;
    for (;;) {
      const token = parser.peek(idx);
      if (token.kind === "eof" || token.kind === "newline") {
        break;
      }
      if (token.kind === "punct") {
        if (token.value === "(") {
          depth++;
        } else if (token.value === ")") {
          depth--;
          if (depth === 0) {
            const nextToken = parser.peek(idx + 1);
            return nextToken.kind === "punct" && nextToken.value === "=>";
          }
        }
      }
      idx++;
    }
    return false;
  }

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();

    // Single-parameter arrow function: x => expr or x As T => expr
    if (this.isEnabled("array-list") && token.kind === "identifier") {
      const arrowOffset =
        parser.peek(1).kind === "punct" && parser.peek(1).value === "=>"
          ? 1
          : (parser.peek(1).kind === "keyword" || parser.peek(1).kind === "identifier") &&
              parser.peek(1).value.toLowerCase() === "as"
            ? 3
            : -1;
      if (
        arrowOffset > 0 &&
        parser.peek(arrowOffset).kind === "punct" &&
        parser.peek(arrowOffset).value === "=>"
      ) {
        const startLoc = token.loc;
        const nameToken = parser.advance();
        let paramType: TypeReference = {
          kind: "TypeReference",
          name: "Variant",
          typeArguments: [],
          loc: locOf(nameToken.loc),
        };
        if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
          paramType = parser.parseTypeReference() ?? paramType;
        }
        parser.expect("punct", "=>", { literal: true });
        const body = parser.parseExpression();
        return {
          kind: "ArrowFunctionExpression",
          parameters: [
            {
              kind: "ParameterDeclaration",
              name: nameToken.value,
              type: paramType,
              loc: locOf(nameToken.loc),
            },
          ],
          body,
          loc: locOf(
            startLoc,
            body.loc ? { line: body.loc.endLine, column: body.loc.endChar } : undefined,
          ),
        };
      }
    }

    // Arrow Function
    if (this.isEnabled("array-list") && this.isArrowFunction(parser)) {
      const startLoc = token.loc;
      parser.advance(); // consume '('
      const parameters: ParameterDeclaration[] = [];
      while (!parser.match("punct", ")") && !parser.isEOF()) {
        let isByRef = false;
        if (parser.consume("keyword", "byref") || parser.consume("identifier", "byref")) {
          isByRef = true;
        } else {
          parser.consume("keyword", "byval");
          parser.consume("identifier", "byval");
        }
        const nameToken = parser.expect("identifier", "<parameter-name>");
        const paramName = nameToken?.value ?? "";
        let paramType: TypeReference = {
          kind: "TypeReference",
          name: "Variant",
          typeArguments: [],
          loc: locOf(parser.peek().loc),
        };
        if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
          const t = parser.parseTypeReference();
          if (t !== null) paramType = t;
        }
        let defaultValue: Expression | undefined;
        if (parser.consume("punct", "=")) {
          defaultValue = parser.parseExpression();
        }
        parameters.push({
          kind: "ParameterDeclaration",
          name: paramName,
          type: paramType,
          isByRef,
          defaultValue,
          loc: locOf(nameToken?.loc ?? parser.peek().loc),
        });
        if (!parser.consume("punct", ",")) break;
      }
      parser.expect("punct", ")", { literal: true });

      let returnType: TypeReference | undefined;
      if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
        returnType = parser.parseTypeReference() ?? undefined;
      }
      parser.expect("punct", "=>", { literal: true });

      let body: Expression | Statement[];
      if (parser.consume("punct", "{")) {
        const statements: Statement[] = [];
        while (!parser.match("punct", "}") && !parser.isEOF()) {
          parser.skipNewlines();
          if (parser.match("punct", "}")) break;
          const s = parser.parseStatement();
          if (s !== null) statements.push(s);
          parser.skipStatementSeparator();
        }
        parser.expect("punct", "}", { literal: true });
        body = statements;
      } else {
        body = parser.parseExpression();
      }

      return {
        kind: "ArrowFunctionExpression",
        parameters,
        body,
        returnType,
        loc: locOf(startLoc, parser.peek().loc),
      };
    }

    // Array literals: [item1, item2, ...]
    if (this.isEnabled("array-list") && token.kind === "punct" && token.value === "[") {
      const startLoc = token.loc;
      parser.advance(); // consume '['
      const elements: (Expression | SpreadExpression)[] = [];

      while (!parser.isEOF()) {
        parser.skipNewlines(); // Pula quebras de linha ANTES do elemento
        if (parser.match("punct", "]")) break;

        if (parser.match("punct", "...")) {
          const spreadLoc = parser.peek().loc;
          parser.advance(); // consume '...'
          const expr = parser.parseExpression();
          elements.push({
            kind: "SpreadExpression",
            expression: expr,
            loc: locOf(spreadLoc),
          });
        } else {
          elements.push(parser.parseExpression());
        }

        parser.skipNewlines(); // <-- CRÍTICO: Pula quebras de linha DEPOIS do elemento, antes da vírgula
        if (!parser.consume("punct", ",")) break;
      }

      parser.skipNewlines(); // Pula quebras de linha antes do fechamento final
      const endToken = parser.expect("punct", "]", { literal: true });

      return {
        kind: "ArrayLiteralExpression",
        elements,
        loc: locOf(startLoc, endToken?.loc),
      };
    }

    // AddressOf operator
    if (
      (token.kind === "identifier" || token.kind === "keyword") &&
      token.value.toLowerCase() === "addressof"
    ) {
      parser.advance(); // consume 'AddressOf'
      const arg = parser.parseExpression(Precedence.Unary);
      return {
        kind: "MethodInvocation",
        methodName: "AddressOf",
        typeArguments: [],
        arguments: [arg],
        loc: locOf(token.loc),
      };
    }

    // Tagged template tag$"..."
    if (token.kind === "identifier" || token.kind === "keyword") {
      const tag = token.value;
      const nextToken = parser.peek(1);
      if (
        this.isEnabled("tagged-template") &&
        nextToken.kind === "string" &&
        nextToken.prefix === "$"
      ) {
        parser.advance(); // consume tag
        const bodyToken = parser.advance();
        return {
          kind: "TaggedTemplateExpression",
          tag,
          body: bodyToken.value,
          loc: locOf(token.loc),
        };
      }
    }

    // String interpolation $"..."
    if (this.isEnabled("interpolation") && token.kind === "string" && token.prefix === "$") {
      const strToken = parser.advance();
      return {
        kind: "TaggedTemplateExpression",
        tag: "",
        body: strToken.value,
        loc: locOf(strToken.loc),
      };
    }

    // Object creation / Object Initializer (New T() With { ... })
    if (
      this.isEnabled("object-initializer") &&
      token.kind === "keyword" &&
      token.value.toLowerCase() === "new"
    ) {
      parser.advance(); // consume 'New'
      const typeRef = parser.parseTypeReference(false) ?? {
        kind: "TypeReference",
        name: "",
        typeArguments: [],
        loc: locOf(token.loc),
      };
      const args: Expression[] = [];
      const hasParentheses = parser.match("punct", "(");
      if (hasParentheses) {
        parser.advance();
        while (!parser.match("punct", ")") && !parser.isEOF()) {
          args.push(parser.parseExpression());
          if (!parser.consume("punct", ",")) break;
        }
        parser.expect("punct", ")", { literal: true });
      }

      const next = parser.peek();
      if (
        (next.kind === "keyword" || next.kind === "identifier") &&
        next.value.toLowerCase() === "with"
      ) {
        const nextNext = parser.peek(1);
        if (nextNext.kind === "punct" && nextNext.value === "{") {
          parser.advance(); // consume 'With'
          parser.advance(); // consume '{'
          const assignments: { member: string; value: Expression }[] = [];
          while (!parser.match("punct", "}") && !parser.isEOF()) {
            parser.consume("punct", "."); // consume '.' if present
            const memberToken = parser.expect("identifier", "<initializer-member>");
            const memberName = memberToken?.value ?? "";
            parser.expect("punct", "=", { literal: true });
            const value = parser.parseExpression();
            assignments.push({ member: memberName, value });
            if (!parser.consume("punct", ",")) break;
          }
          parser.expect("punct", "}", { literal: true });
          return {
            kind: "ObjectInitializerExpression",
            type: typeRef,
            arguments: args,
            assignments,
            loc: locOf(token.loc),
          };
        }
      }

      return {
        kind: "ObjectCreationExpression",
        type: typeRef,
        arguments: args,
        noParentheses: !hasParentheses,
        loc: locOf(token.loc),
      };
    }

    return null;
  }

  parseExpressionInfix(parser: Parser, left: Expression, token: Token): Expression | null {
    // Optional chaining ?.
    if (this.isEnabled("optional-chain") && token.kind === "punct" && token.value === "?.") {
      parser.advance(); // consume '?.'
      const memberToken = parser.consume("identifier") ?? parser.consume("keyword");
      if (!memberToken) {
        parser.recordError(
          "expected-token",
          `Expected '<member-name>', got '${parser.peek().value || parser.peek().kind}'.`,
          parser.peek().loc,
        );
      }
      const member = memberToken?.value ?? "";
      let memberExpr: Expression;
      if (parser.match("punct", "(")) {
        parser.advance();
        const args: Expression[] = [];
        while (!parser.match("punct", ")") && !parser.isEOF()) {
          args.push(parser.parseExpression());
          if (!parser.consume("punct", ",")) break;
        }
        parser.expect("punct", ")", { literal: true });
        memberExpr = {
          kind: "MethodInvocation",
          methodName: member,
          typeArguments: [],
          arguments: args,
          loc: locOf(memberToken?.loc ?? token.loc),
        };
      } else {
        memberExpr = {
          kind: "MemberAccess",
          target: { kind: "Identifier", name: "", loc: left.loc },
          member,
          loc: locOf(memberToken?.loc ?? token.loc),
        };
      }
      return {
        kind: "OptionalChainingExpression",
        target: left,
        member: memberExpr,
        loc: left.loc,
      };
    }

    // Ternary expression: cond ? true : false
    if (this.isEnabled("ternary") && token.kind === "punct" && token.value === "?") {
      parser.advance(); // consume '?'
      const trueExpr = parser.parseExpression();
      parser.expect("punct", ":", { literal: true });
      const falseExpr = parser.parseExpression(Precedence.Ternary);
      return {
        kind: "TernaryExpression",
        condition: left,
        trueExpr,
        falseExpr,
        loc: left.loc,
      };
    }

    // Null coalescing: left ?? right
    if (this.isEnabled("null-coalesce") && token.kind === "punct" && token.value === "??") {
      parser.advance(); // consume '??'
      const right = parser.parseExpression(Precedence.NullCoalescing);
      return {
        kind: "NullCoalescingExpression",
        left,
        right,
        loc: left.loc,
      };
    }

    // Pipe operator: left |> right
    if (this.isEnabled("pipe") && token.kind === "punct" && token.value === "|>") {
      parser.advance(); // consume '|>'
      const right = parser.parseExpression(Precedence.Pipe);
      return {
        kind: "PipeExpression",
        left,
        right,
        loc: left.loc,
      };
    }

    return null;
  }

  private isEnabled(id: string): boolean {
    return this.enabledSugarIds === undefined || this.enabledSugarIds.has(id.toLowerCase());
  }

  private enunKeywordOffset(parser: Parser): number | undefined {
    let offset = 0;
    while (this.isModifierToken(parser.peek(offset))) {
      offset++;
    }
    const token = parser.peek(offset);
    if (
      (token.kind === "keyword" || token.kind === "identifier") &&
      token.value.toLowerCase() === "enun"
    ) {
      return offset;
    }
    return undefined;
  }

  private isModifierToken(token: Token): boolean {
    if (token.kind !== "keyword" && token.kind !== "identifier") return false;
    return [
      "public",
      "private",
      "protected",
      "shared",
      "overrides",
      "override",
      "static",
      "readonly",
    ].includes(token.value.toLowerCase());
  }

  private parseEnum(parser: Parser): EnumDeclaration {
    const startLoc = parser.peek().loc;
    const modifiers = parser.parseModifiers();
    parser.advance(); // 'Enun'
    const nameToken = parser.expect("identifier", "<enum-name>");
    const name = nameToken?.value ?? "";
    parser.skipToEndOfLine();

    const entries: { name: string; value?: Expression; loc?: SourceLocation }[] = [];
    let endLoc: TokenLocation | undefined;
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("enun")) {
        endLoc = parser.consumeEnd("enun");
        parser.skipToEndOfLine();
        break;
      }

      if (parser.peek().kind === "comment") {
        parser.consumeLineAsOpaque();
        continue;
      }

      const entryNameToken = parser.consume("identifier");
      if (entryNameToken) {
        const entryName = entryNameToken.value;
        let value: Expression | undefined;
        if (parser.consume("punct", "=")) {
          value = parser.parseExpression();
        }
        const entryLoc = value?.loc
          ? {
              startLine: entryNameToken.loc.line,
              startChar: entryNameToken.loc.column,
              endLine: value.loc.endLine,
              endChar: value.loc.endChar,
            }
          : locOf(entryNameToken.loc);
        entries.push({ name: entryName, value, loc: entryLoc });
      } else {
        parser.consumeLineAsOpaque();
      }
      parser.skipToEndOfLine();
    }

    return {
      kind: "EnumDeclaration",
      name,
      entries,
      loc: locOf(startLoc, endLoc),
      isSugar: true,
      modifiers,
    };
  }

  private parseUsing(parser: Parser): UsingStatement {
    const startLoc = parser.peek().loc;
    parser.advance(); // consume 'Using'
    const resourceVarToken = parser.expect("identifier", "<resource-variable>");
    const resourceVar: Identifier = {
      kind: "Identifier",
      name: resourceVarToken?.value ?? "",
      loc: locOf(resourceVarToken?.loc ?? startLoc),
    };
    parser.expect("keyword", "as", { literal: true });
    parser.consume("keyword", "new");
    parser.consume("identifier", "new");
    const resourceType = parser.parseTypeReference() ?? {
      kind: "TypeReference",
      name: "",
      typeArguments: [],
      loc: locOf(startLoc),
    };
    const resourceArgs: Expression[] = [];
    if (parser.consume("punct", "(")) {
      while (!parser.match("punct", ")") && !parser.isEOF()) {
        resourceArgs.push(parser.parseExpression());
        if (!parser.consume("punct", ",")) break;
      }
      parser.expect("punct", ")", { literal: true });
    }
    parser.skipToEndOfLine();

    const body: Statement[] = [];
    let endLoc: TokenLocation | undefined;
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("using")) {
        endLoc = parser.consumeEnd("using");
        parser.skipToEndOfLine();
        break;
      }
      const s = parser.parseStatement();
      if (s !== null) body.push(s);
      parser.skipStatementSeparator();
    }

    return {
      kind: "UsingStatement",
      resourceVar,
      resourceType,
      resourceArgs,
      body,
      loc: locOf(startLoc, endLoc),
    };
  }
}
