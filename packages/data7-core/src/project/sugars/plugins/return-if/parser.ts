import type { Statement } from "../../../ast/ast";
import type { Parser } from "../../../parser/parser";
import { locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class ReturnIfParserPlugin implements ParserPlugin {
  readonly name = "ReturnIfParserPlugin";

  parseStatement(parser: Parser): Statement | null {
    const head = parser.peek();
    if (
      (head.kind === "keyword" || head.kind === "identifier") &&
      head.value.toLowerCase() === "return"
    ) {
      const next = parser.peek(1);
      if (
        (next.kind === "keyword" || next.kind === "identifier") &&
        next.value.toLowerCase() === "if"
      ) {
        const startLoc = head.loc;
        parser.advance(); // consume 'Return'
        parser.advance(); // consume 'If'
        const condition = parser.parseExpression();
        parser.expect("keyword", "then", { literal: true });
        const trueExpr = parser.parseExpression();
        parser.expect("keyword", "else", { literal: true });
        const falseExpr = parser.parseExpression();
        return {
          kind: "ReturnStatement" as const,
          expression: {
            kind: "TernaryExpression" as const,
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
}
