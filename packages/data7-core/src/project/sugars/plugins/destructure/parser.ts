import type { Statement } from "../../../ast/ast";
import type { Parser } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";
import { parseDestructuringDeclaration } from "../../../parser/plugins/sugars/destructuring";

export class DestructureParserPlugin implements ParserPlugin {
  readonly name = "DestructureParserPlugin";

  constructor(
    private readonly enableObject: boolean,
    private readonly enableArray: boolean,
  ) {}

  parseVariableDeclaration(parser: Parser): Statement | null {
    if (parser.match("punct", "{") && !this.enableObject) return null;
    if (parser.match("punct", "[") && !this.enableArray) return null;
    return parseDestructuringDeclaration(parser);
  }
}
