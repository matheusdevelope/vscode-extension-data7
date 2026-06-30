import type { EnumDeclaration, Expression, SourceLocation } from "../../../ast/ast";
import { Parser, locOf } from "../../../parser/parser";
import type { ParserPlugin } from "../../../parser/plugin";
import type { Token, TokenLocation } from "../../../parser/token-types";

export class EnumParserPlugin implements ParserPlugin {
  readonly name = "EnumParserPlugin";

  parseStatement(parser: Parser): EnumDeclaration | null {
    const enunOffset = this.enunKeywordOffset(parser);
    if (enunOffset !== undefined) {
      return this.parseEnum(parser);
    }
    return null;
  }

  private enunKeywordOffset(parser: Parser): number | undefined {
    let offset = 0;
    while (this.isModifierToken(parser.peek(offset))) {
      offset++;
    }
    const token = parser.peek(offset);
    if (
      (token.kind === "keyword" || token.kind === "identifier") &&
      token.value.toLowerCase() === "enun"
    ) {
      return offset;
    }
    return undefined;
  }

  private isModifierToken(token: Token): boolean {
    if (token.kind !== "keyword" && token.kind !== "identifier") return false;
    return [
      "public",
      "private",
      "protected",
      "shared",
      "overrides",
      "override",
      "static",
      "readonly",
    ].includes(token.value.toLowerCase());
  }

  private parseEnum(parser: Parser): EnumDeclaration {
    const startLoc = parser.peek().loc;
    const modifiers = parser.parseModifiers();
    parser.advance(); // 'Enun'
    const nameToken = parser.expect("identifier", "<enum-name>");
    const name = nameToken?.value ?? "";
    parser.skipToEndOfLine();

    const entries: { name: string; value?: Expression; loc?: SourceLocation }[] = [];
    let endLoc: TokenLocation | undefined;
    while (!parser.isEOF()) {
      parser.skipNewlines();
      if (parser.matchEnd("enun")) {
        endLoc = parser.consumeEnd("enun");
        parser.skipToEndOfLine();
        break;
      }

      if (parser.peek().kind === "comment") {
        parser.consumeLineAsOpaque();
        continue;
      }

      const entryNameToken = parser.consume("identifier");
      if (entryNameToken) {
        const entryName = entryNameToken.value;
        let value: Expression | undefined;
        if (parser.consume("punct", "=")) {
          value = parser.parseExpression();
        }
        const entryLoc = value?.loc
          ? {
              startLine: entryNameToken.loc.line,
              startChar: entryNameToken.loc.column,
              endLine: value.loc.endLine,
              endChar: value.loc.endChar,
            }
          : locOf(entryNameToken.loc);
        entries.push({ name: entryName, value, loc: entryLoc });
      } else {
        parser.consumeLineAsOpaque();
      }
      parser.skipToEndOfLine();
    }

    return {
      kind: "EnumDeclaration",
      name,
      entries,
      loc: locOf(startLoc, endLoc),
      modifiers,
      isSugar: true,
    };
  }
}
