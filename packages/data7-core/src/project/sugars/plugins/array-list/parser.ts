import type { Expression } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class ArrayListParserPlugin implements ParserPlugin {
  readonly name = "ArrayListParserPlugin";

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();

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
}
