import type { Expression } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class OptionalChainParserPlugin implements ParserPlugin {
  readonly name = "OptionalChainParserPlugin";

  parseExpressionInfix(parser: Parser, left: Expression): Expression | null {
    const token = parser.peek();
    if (token.kind === "punct" && token.value === "?.") {
      parser.advance(); // consume '?.'
      const memberToken = parser.expect("identifier", "<optional-member-name>");
      const memberName = memberToken?.value ?? "";
      let memberExpr: Expression = {
        kind: "MemberAccess" as const,
        target: left,
        member: memberName,
        loc: locOf(token.loc),
      };

      if (parser.match("punct", "(")) {
        const args = parser.parseOptionalArgumentList() ?? [];
        memberExpr = {
          kind: "MethodInvocation" as const,
          methodName: memberName,
          arguments: args,
          typeArguments: [],
          loc: locOf(token.loc),
        };
      }

      return {
        kind: "OptionalChainingExpression" as const,
        target: left,
        member: memberExpr as any,
        loc: left.loc,
      };
    }
    return null;
  }
}
