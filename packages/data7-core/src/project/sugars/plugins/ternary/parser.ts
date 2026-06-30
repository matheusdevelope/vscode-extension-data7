import type { Expression } from "../../../ast/ast";
import { Parser, locOf, Precedence } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class TernaryParserPlugin implements ParserPlugin {
  readonly name = "TernaryParserPlugin";

  parseExpressionInfix(parser: Parser, left: Expression): Expression | null {
    const token = parser.peek();
    if (token.kind === "punct" && token.value === "?") {
      parser.advance(); // consume '?'
      const trueExpr = parser.parseExpression();
      parser.expect("punct", ":", { literal: true });
      const falseExpr = parser.parseExpression(Precedence.Ternary);
      return {
        kind: "TernaryExpression" as const,
        condition: left,
        trueExpr,
        falseExpr,
        loc: left.loc,
      };
    }
    return null;
  }
}
