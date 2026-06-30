import type { Expression, TypeReference } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class ArrayListParserPlugin implements ParserPlugin {
  readonly name = "ArrayListParserPlugin";

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();

    // Single-parameter arrow function: x => expr or x As T => expr
    if (token.kind === "identifier") {
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
          kind: "TypeReference" as const,
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
          kind: "ArrowFunctionExpression" as const,
          parameters: [
            {
              kind: "ParameterDeclaration" as const,
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

    // Arrow Function with parentheses
    if (this.isArrowFunction(parser)) {
      const startLoc = token.loc;
      parser.advance(); // consume '('
      const parameters = [];
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
          kind: "TypeReference" as const,
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
          kind: "ParameterDeclaration" as const,
          name: paramName,
          type: paramType,
          isByRef,
          defaultValue,
          loc: locOf(nameToken?.loc ?? parser.peek().loc),
        });
        if (!parser.consume("punct", ",")) break;
      }
      parser.expect("punct", ")", { literal: true });

      let returnType: any;
      if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
        returnType = parser.parseTypeReference() ?? undefined;
      }
      parser.expect("punct", "=>", { literal: true });

      let body: any;
      if (parser.consume("punct", "{")) {
        const statements = [];
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
        kind: "ArrowFunctionExpression" as const,
        parameters,
        body,
        returnType,
        loc: locOf(startLoc, parser.peek().loc),
      };
    }

    // Array literals: [item1, item2, ...]
    if (token.kind === "punct" && token.value === "[") {
      const startLoc = token.loc;
      parser.advance(); // consume '['
      const elements = [];

      while (!parser.isEOF()) {
        parser.skipNewlines();
        if (parser.match("punct", "]")) break;

        if (parser.match("punct", "...")) {
          const spreadLoc = parser.peek().loc;
          parser.advance(); // consume '...'
          const expr = parser.parseExpression();
          elements.push({
            kind: "SpreadExpression" as const,
            expression: expr,
            loc: locOf(spreadLoc),
          });
        } else {
          elements.push(parser.parseExpression());
        }

        parser.skipNewlines();
        if (!parser.consume("punct", ",")) break;
      }

      parser.skipNewlines();
      const endToken = parser.expect("punct", "]", { literal: true });

      return {
        kind: "ArrayLiteralExpression" as const,
        elements,
        loc: locOf(startLoc, endToken?.loc),
      };
    }

    return null;
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
}
