import type { Expression } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class InterpolationParserPlugin implements ParserPlugin {
  readonly name = "InterpolationParserPlugin";

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();
    if (token.kind === "string" && token.prefix === "$") {
      const strToken = parser.advance();
      return {
        kind: "TaggedTemplateExpression" as const,
        tag: "",
        body: strToken.value,
        loc: locOf(strToken.loc),
      };
    }
    return null;
  }
}
