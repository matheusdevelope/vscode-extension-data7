import type { Expression } from "../../../ast/ast";
import { Parser, locOf, Precedence } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class PipeParserPlugin implements ParserPlugin {
  readonly name = "PipeParserPlugin";

  parseExpressionInfix(parser: Parser, left: Expression): Expression | null {
    const token = parser.peek();
    if (token.kind === "punct" && token.value === "|>") {
      parser.advance(); // consume '|>'
      const right = parser.parseExpression(Precedence.Pipe);
      return {
        kind: "PipeExpression" as const,
        left,
        right,
        loc: left.loc,
      };
    }
    return null;
  }
}
