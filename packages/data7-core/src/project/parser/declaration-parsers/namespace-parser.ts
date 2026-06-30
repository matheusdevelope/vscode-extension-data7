import type { NamespaceDeclaration, TopLevelMember } from "../../ast/ast";
import { Parser, locOf } from "../parser";
import type { TokenLocation } from "../token-types";

export function parseNamespace(parser: Parser): NamespaceDeclaration {
  const startLoc = parser.peek().loc;
  // Consume any leading modifiers we ignored at the peek stage.
  parser.parseModifiers();
  parser.advance(); // 'Namespace'
  const nameToken = parser.expect("identifier", "<namespace-name>");
  const name = nameToken?.value ?? "";
  parser.skipToEndOfLine();

  const members: TopLevelMember[] = [];
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd("namespace")) {
      endLoc = parser.consumeEnd("namespace");
      parser.skipToEndOfLine();
      return { kind: "NamespaceDeclaration", name, members, loc: locOf(startLoc, endLoc) };
    }
    const m = parser.parseTopLevelMember();
    if (m !== null) {
      if (Array.isArray(m)) {
        members.push(...m);
      } else {
        members.push(m);
      }
    }
  }
  parser.recordError(
    "unterminated-block",
    `Namespace '${name}' is missing 'End Namespace'.`,
    startLoc,
  );
  return { kind: "NamespaceDeclaration", name, members, loc: locOf(startLoc) };
}
