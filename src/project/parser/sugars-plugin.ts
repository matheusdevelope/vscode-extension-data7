import type {
  Expression,
  Statement,
  DestructuredVariableDeclaration,
  DestructuringBinding,
  ObjectInitializerExpression,
  ObjectCreationExpression,
  TypeReference,
  EnumDeclaration,
  UsingStatement,
  MatchStatement,
} from "../generics-monomorphizer/ast";
import type { Token } from "./token-types";
import type { Parser } from "./parser";
import type { ParserPlugin } from "./plugin";
import { Precedence } from "./parser";

function locOf(loc: any, endLoc?: any) {
  return {
    startLine: loc.line,
    startChar: loc.column,
    endLine: endLoc ? endLoc.line : loc.line,
    endChar: endLoc ? endLoc.column : loc.column,
  };
}

export class SugarsParserPlugin implements ParserPlugin {
  readonly name = "SugarsParserPlugin";

  parseStatement(parser: Parser): Statement | null {
    const head = parser.peek();
    if (head.kind !== "keyword" && head.kind !== "identifier") {
      return null;
    }

    const v = head.value.toLowerCase();
    if (v === "enum") {
      return this.parseEnum(parser);
    }
    if (v === "using") {
      return this.parseUsing(parser);
    }
    if (v === "match") {
      return this.parseMatch(parser);
    }
    if (v === "return") {
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
          } as any,
          loc: locOf(startLoc),
        } as any;
      }
    }
    return null;
  }

  parseVariableDeclaration(parser: Parser): Statement | null {
    // Intercept destructured variables declaration, e.g. Dim { a, b } = obj or Dim [ a, b ] = obj
    const startLoc = parser.peek().loc;
    
    // Check if the current token is Dim (already consumed by core parser, but let's be sure about state)
    // Wait, the core parser consumes 'Dim' and then calls: plugin.parseVariableDeclaration(parser, startLoc, isConst)
    // Let's check how we designed the call in parser.ts:
    // we will design it so the core parser has already consumed the keyword, and calls it.
    // So the next token is the start of destructuring.
    const nextToken = parser.peek();
    const isOpenBrace = parser.consume("punct", "{") !== null;
    const isOpenBracket = !isOpenBrace && parser.consume("punct", "[") !== null;
    
    if (!isOpenBrace && !isOpenBracket) {
      return null;
    }
    
    const isObject = isOpenBrace;
    const bindings: DestructuringBinding[] = [];
    const closeChar = isObject ? "}" : "]";
    
    while (!parser.match("punct", closeChar) && !parser.isEOF() && !parser.match("newline")) {
      let name = "";
      let property: string | undefined;
      let defaultValue: Expression | undefined;
      let isRest = false;
      
      if (!isObject && parser.consume("punct", "...")) {
        isRest = true;
      }
      
      const nameToken = parser.expect("identifier", "<destructuring-name>");
      const rawName = nameToken?.value ?? "";
      
      if (isObject) {
        if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
          const bindingToken = parser.expect("identifier", "<binding-name>");
          name = bindingToken?.value ?? "";
          property = rawName;
        } else {
          name = rawName;
        }
      } else {
        name = rawName;
      }
      
      if (parser.consume("punct", "=")) {
        defaultValue = parser.parseExpression();
      }
      
      bindings.push({ name, property, defaultValue, isRest });
      
      if (!parser.consume("punct", ",")) break;
    }
    
    parser.expect("punct", closeChar, { literal: true });
    parser.expect("punct", "=", { literal: true });
    const initializer = parser.parseExpression();
    const comment = parser.skipToEndOfLine();
    
    return {
      kind: "DestructuredVariableDeclaration",
      isObject,
      bindings,
      initializer,
      loc: locOf(startLoc),
      comment
    } as any; // Cast as any because the types in generics-monomorphizer/ast are mapped
  }

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();
    
    // Tagged template tag$"..."
    if (token.kind === "identifier" || token.kind === "keyword") {
      const lower = token.value.toLowerCase();
      const nextToken = parser.peek(1);
      if (nextToken.kind === "string" && nextToken.prefix === "$") {
        const tag = parser.advance().value;
        const bodyToken = parser.advance();
        return {
          kind: "TaggedTemplateExpression",
          tag,
          body: bodyToken.value,
          loc: locOf(token.loc),
        } as any;
      }
    }
    
    // String interpolation $"..."
    if (token.kind === "string" && token.prefix === "$") {
      const strToken = parser.advance();
      return {
        kind: "TaggedTemplateExpression",
        tag: "",
        body: strToken.value,
        loc: locOf(strToken.loc),
      } as any;
    }

    // Object creation / Object Initializer (New T() With { ... })
    if (token.kind === "keyword" && token.value.toLowerCase() === "new") {
      parser.advance(); // consume 'New'
      const typeRef = parser.parseTypeReference(false) ?? {
        kind: "TypeReference",
        name: "",
        typeArguments: [],
        loc: locOf(token.loc),
      };
      const args: Expression[] = [];
      parser.expect("punct", "(", { literal: true });
      while (!parser.match("punct", ")") && !parser.isEOF()) {
        args.push(parser.parseExpression());
        if (!parser.consume("punct", ",")) break;
      }
      parser.expect("punct", ")", { literal: true });

      const next = parser.peek();
      if ((next.kind === "keyword" || next.kind === "identifier") && next.value.toLowerCase() === "with") {
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
            type: typeRef as any,
            arguments: args,
            assignments,
            loc: locOf(token.loc),
          } as any;
        }
      }

      return {
        kind: "ObjectCreationExpression",
        type: typeRef as any,
        arguments: args,
        loc: locOf(token.loc),
      } as any;
    }

    return null;
  }

  parseExpressionInfix(parser: Parser, left: Expression, token: Token): Expression | null {
    // Optional chaining ?.
    if (token.kind === "punct" && token.value === "?.") {
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
        } as any;
      } else {
        memberExpr = {
          kind: "MemberAccess",
          target: { kind: "Identifier", name: "", loc: left.loc } as any,
          member,
          loc: locOf(memberToken?.loc ?? token.loc),
        } as any;
      }
      return {
        kind: "OptionalChainingExpression",
        target: left,
        member: memberExpr,
        loc: left.loc,
      } as any;
    }

    // Ternary expression: cond ? true : false
    if (token.kind === "punct" && token.value === "?") {
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
      } as any;
    }

    // Null coalescing: left ?? right
    if (token.kind === "punct" && token.value === "??") {
      parser.advance(); // consume '??'
      const right = parser.parseExpression(Precedence.NullCoalescing);
      return {
        kind: "NullCoalescingExpression",
        left,
        right,
        loc: left.loc,
      } as any;
    }

    // Pipe operator: left |> right
    if (token.kind === "punct" && token.value === "|>") {
      parser.advance(); // consume '|>'
      const right = parser.parseExpression(Precedence.Pipe);
      return {
        kind: "PipeExpression",
        left,
        right,
        loc: left.loc,
      } as any;
    }

    return null;
  }

  private parseEnum(parser: Parser): EnumDeclaration {
    const startLoc = parser.peek().loc;
    parser.parseModifiers();
    parser.advance(); // 'Enum'
    const nameToken = parser.expect("identifier", "<enum-name>");
    const name = nameToken?.value ?? "";
    let baseType: TypeReference | undefined;
    if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
      baseType = parser.parseTypeReference() ?? undefined;
    }
    parser.skipToEndOfLine();
    
    const entries: { name: string; value?: Expression; loc?: any }[] = [];
    let endLoc: any;
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("enum")) {
        endLoc = parser.consumeEnd("enum");
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
        const entryLoc = value?.loc ? {
          startLine: entryNameToken.loc.line,
          startChar: entryNameToken.loc.column,
          endLine: value.loc.endLine,
          endChar: value.loc.endChar,
        } : locOf(entryNameToken.loc);
        entries.push({ name: entryName, value, loc: entryLoc });
      } else {
        parser.consumeLineAsOpaque();
      }
      parser.skipToEndOfLine();
    }
    
    return {
      kind: "EnumDeclaration",
      name,
      baseType: baseType as any,
      entries,
      loc: locOf(startLoc, endLoc),
      modifiers: [] // Modifiers are processed but not used in EnumDeclaration usually
    } as any;
  }

  private parseUsing(parser: Parser): UsingStatement {
    const startLoc = parser.peek().loc;
    parser.advance(); // consume 'Using'
    const resourceVarToken = parser.expect("identifier", "<resource-variable>");
    const resourceVar = {
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
    let endLoc: any;
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
      resourceVar: resourceVar as any,
      resourceType: resourceType as any,
      resourceArgs,
      body,
      loc: locOf(startLoc, endLoc),
    } as any;
  }

  private parseMatch(parser: Parser): MatchStatement {
    const startLoc = parser.peek().loc;
    parser.advance(); // consume 'Match'
    const subject = parser.parseExpression();
    parser.skipToEndOfLine();

    const cases: { typeName?: string; isElse: boolean; body: Statement[] }[] = [];
    let endLoc: any;
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("match")) {
        endLoc = parser.consumeEnd("match");
        parser.skipToEndOfLine();
        break;
      }

      const head = parser.peek();
      if ((head.kind === "keyword" || head.kind === "identifier") && parser.eq(head, "case")) {
        parser.advance(); // consume 'Case'
        const next = parser.peek();
        let typeName: string | undefined;
        let isElse = false;

        if ((next.kind === "keyword" || next.kind === "identifier") && parser.eq(next, "is")) {
          parser.advance(); // consume 'Is'
          const typeRef = parser.parseTypeReference();
          typeName = typeRef ? typeRef.name : undefined;
        } else if (
          (next.kind === "keyword" || next.kind === "identifier") &&
          parser.eq(next, "else")
        ) {
          parser.advance(); // consume 'Else'
          isElse = true;
        }

        parser.expect("punct", ":", { literal: true });

        const caseBody: Statement[] = [];
        while (!parser.isEOF()) {
          parser.skipNewlines();
          const nextHead = parser.peek();
          if (
            (nextHead.kind === "keyword" || nextHead.kind === "identifier") &&
            (parser.eq(nextHead, "case") ||
              (parser.eq(nextHead, "end") && parser.eq(parser.peek(1), "match")))
          ) {
            break;
          }
          const s = parser.parseStatement();
          if (s !== null) caseBody.push(s);
          parser.skipStatementSeparator();
        }
        cases.push({ typeName, isElse, body: caseBody });
        continue;
      }
      parser.advance();
    }

    return {
      kind: "MatchStatement",
      subject,
      cases,
      loc: locOf(startLoc, endLoc),
    } as any;
  }
}
