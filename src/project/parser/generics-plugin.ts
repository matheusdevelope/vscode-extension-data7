import type { TypeParameter, TypeReference } from "../ast/ast";
import type { Parser } from "./parser";
import type { ParserPlugin } from "./plugin";

export class GenericsParserPlugin implements ParserPlugin {
  readonly name = "GenericsParserPlugin";

  parseTypeParameters(parser: Parser): TypeParameter[] | null {
    if (!parser.match("punct", "<")) return null;
    parser.advance(); // consume '<'
    const params: TypeParameter[] = [];
    while (!parser.match("punct", ">") && !parser.isEOF()) {
      const nameToken = parser.consume("identifier");
      if (nameToken === null) break;
      const tp: TypeParameter = { kind: "TypeParameter", name: nameToken.value };
      if (parser.consume("keyword", "as") || parser.consume("identifier", "as")) {
        const c = parser.parseTypeReference();
        if (c !== null) tp.constraint = c;
      }
      params.push(tp);
      if (!parser.consume("punct", ",")) break;
    }
    parser.expect("punct", ">", { literal: true });
    return params;
  }

  parseTypeArguments(parser: Parser): TypeReference[] | null {
    if (!parser.match("punct", "<")) return null;
    parser.advance(); // consume '<'
    const args: TypeReference[] = [];
    while (!parser.match("punct", ">") && !parser.isEOF()) {
      const arg = parser.parseTypeReference();
      if (arg !== null) args.push(arg);
      if (!parser.consume("punct", ",")) break;
    }
    parser.expect("punct", ">", { literal: true });
    return args;
  }
}
