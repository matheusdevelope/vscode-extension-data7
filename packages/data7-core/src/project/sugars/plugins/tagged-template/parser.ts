import type { Expression } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class TaggedTemplateParserPlugin implements ParserPlugin {
  readonly name = "TaggedTemplateParserPlugin";

  parseExpressionPrefix(parser: Parser): Expression | null {
    const token = parser.peek();
    if (token.kind === "identifier" || token.kind === "keyword") {
      const tag = token.value;
      const nextToken = parser.peek(1);
      if (nextToken.kind === "string" && nextToken.prefix === "$") {
        parser.advance(); // consume tag
        const bodyToken = parser.advance();
        return {
          kind: "TaggedTemplateExpression" as const,
          tag,
          body: bodyToken.value,
          loc: locOf(token.loc),
        };
      }
    }
    return null;
  }
}
