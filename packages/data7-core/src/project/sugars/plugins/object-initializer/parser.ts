import type { Expression } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class ObjectInitializerParserPlugin implements ParserPlugin {
  readonly name = "ObjectInitializerParserPlugin";

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();
    if (token.kind === "keyword" && token.value.toLowerCase() === "new") {
      parser.advance(); // consume 'New'
      const typeRef = parser.parseTypeReference(false) ?? {
        kind: "TypeReference" as const,
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
            kind: "ObjectInitializerExpression" as const,
            type: typeRef,
            arguments: args,
            assignments,
            loc: locOf(token.loc),
          };
        }
      }

      return {
        kind: "ObjectCreationExpression" as const,
        type: typeRef,
        arguments: args,
        noParentheses: !hasParentheses,
        loc: locOf(token.loc),
      };
    }
    return null;
  }
}
