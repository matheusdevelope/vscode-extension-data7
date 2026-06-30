import type { Statement } from "../../../ast/ast";
import type { Parser } from "../../../parser/parser";
import { locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";

export class UsingParserPlugin implements ParserPlugin {
  readonly name = "UsingParserPlugin";

  parseStatement(parser: Parser): Statement | null {
    const head = parser.peek();
    if (
      (head.kind === "keyword" || head.kind === "identifier") &&
      head.value.toLowerCase() === "using"
    ) {
      const startLoc = head.loc;
      parser.advance(); // consume 'Using'
      const resourceVarToken = parser.expect("identifier", "<using-variable>");
      const resourceVar = {
        kind: "Identifier" as const,
        name: resourceVarToken?.value ?? "",
        loc: resourceVarToken ? locOf(resourceVarToken.loc) : undefined,
      };
      parser.expect("keyword", "as", { literal: true });
      parser.consume("keyword", "new");
      parser.consume("identifier", "new");
      const resourceType = parser.parseTypeReference() ?? {
        kind: "TypeReference" as const,
        name: "",
        typeArguments: [],
      };
      const resourceArgs = parser.parseOptionalArgumentList() ?? [];
      const comment = parser.skipToEndOfLine();

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
        kind: "UsingStatement" as const,
        resourceVar,
        resourceType,
        resourceArgs,
        body,
        loc: locOf(startLoc, endLoc),
        comment,
      };
    }
    return null;
  }
}
