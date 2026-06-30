import type { EnumDeclaration, Expression, SourceLocation } from "../../ast/ast";
import { Parser, locOf } from "../parser";
import type { TokenLocation } from "../token-types";

export function parseNativeEnumDeclaration(parser: Parser): EnumDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  parser.advance(); // 'Enum'
  const nameToken = parser.expect("identifier", "<enum-name>");
  const name = nameToken?.value ?? "";
  parser.skipToEndOfLine();

  const entries: { name: string; value?: Expression; loc?: SourceLocation }[] = [];
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd("enum")) {
      endLoc = parser.consumeEnd("enum");
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
  };
}
