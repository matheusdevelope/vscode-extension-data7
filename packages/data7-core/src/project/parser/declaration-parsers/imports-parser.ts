import type { ImportsDeclaration } from "../../ast/ast";
import { Parser, locOf } from "../parser";

/**
 * Parses Imports statements. Supports both single and comma-separated multiple imports:
 * `Imports Collections`
 * `Imports Forms, mod_winapi`
 */
export function parseImportsDeclaration(parser: Parser): ImportsDeclaration[] {
  const startLoc = parser.peek().loc;
  parser.advance(); // consume 'Imports'

  const imports: ImportsDeclaration[] = [];

  do {
    const itemStartLoc = parser.peek().loc;
    const parts: string[] = [];
    const firstIdent = parser.expect("identifier", "<namespace-or-module-name>");
    if (firstIdent) {
      parts.push(firstIdent.value);
    } else {
      break;
    }

    while (parser.consume("punct", ".")) {
      const nextIdent = parser.expect("identifier", "<namespace-or-module-name>");
      if (nextIdent) {
        parts.push(nextIdent.value);
      } else {
        break;
      }
    }

    const target = parts.join(".");
    imports.push({
      kind: "ImportsDeclaration",
      target,
      loc: locOf(itemStartLoc, parser.peek().loc),
    });
  } while (parser.consume("punct", ","));

  const comment = parser.skipToEndOfLine();
  if (imports.length > 0 && comment) {
    const last = imports[imports.length - 1];
    if (last) {
      (last as any).comment = comment;
    }
  }

  return imports;
}
