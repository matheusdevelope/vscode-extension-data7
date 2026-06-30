import type { ClassDeclaration, ClassMember } from "../../ast/ast";
import { Parser, locOf } from "../parser";
import type { TokenLocation } from "../token-types";
import { parseDeclareDeclaration } from "./declare-parser";
import { parseMethod } from "./method-parser";
import { parseProperty } from "./property-parser";
import { parseField } from "./field-parser";

/**
 * Parses Class or Structure declarations and their members (including nested classes).
 */
export function parseClass(parser: Parser): ClassDeclaration {
  const startLoc = parser.peek().loc;
  const modifiers = parser.parseModifiers();
  const isStructure = parser.eq(parser.peek(), "structure");
  parser.advance(); // 'Class' or 'Structure'
  if (isStructure) {
    modifiers.push("structure");
  }
  const nameToken = parser.expect("identifier", isStructure ? "<structure-name>" : "<class-name>");
  const name = nameToken?.value ?? "";
  const typeParameters = parser.parseOptionalTypeParameters();
  let baseType: any; // TypeReference
  if (parser.match("keyword", "Inherits") || parser.match("identifier", "Inherits")) {
    parser.advance();
    const parsed = parser.parseTypeReference();
    if (parsed !== null) baseType = parsed;
  }
  parser.skipToEndOfLine();
  parser.skipNewlines();
  if (parser.match("keyword", "Inherits") || parser.match("identifier", "Inherits")) {
    parser.advance();
    const parsed = parser.parseTypeReference();
    if (parsed !== null) baseType = parsed;
    parser.skipToEndOfLine();
  }

  const classMembers: ClassMember[] = [];
  const endKind = isStructure ? "structure" : "class";
  let endLoc: TokenLocation | undefined;
  while (!parser.isEOF()) {
    parser.skipNewlines();
    if (parser.matchEnd(endKind)) {
      endLoc = parser.consumeEnd(endKind);
      parser.skipToEndOfLine();
      const decl: ClassDeclaration = {
        kind: "ClassDeclaration",
        name,
        typeParameters,
        members: classMembers,
        loc: locOf(startLoc, endLoc),
        modifiers,
      };
      if (baseType !== undefined) decl.baseType = baseType;
      return decl;
    }
    const m = parseClassMember(parser);
    if (m !== null) classMembers.push(m);
  }
  parser.recordError(
    "unterminated-block",
    `${isStructure ? "Structure" : "Class"} '${name}' is missing 'End ${isStructure ? "Structure" : "Class"}'.`,
    startLoc,
  );
  const decl: ClassDeclaration = {
    kind: "ClassDeclaration",
    name,
    typeParameters,
    members: classMembers,
    loc: locOf(startLoc),
    modifiers,
  };
  if (baseType !== undefined) decl.baseType = baseType;
  return decl;
}

export function parseClassMember(parser: Parser): ClassMember | null {
  let lookahead = 0;
  while (parser.peekIsModifier(lookahead)) lookahead++;
  const head = parser.peek(lookahead);
  if (head.kind === "keyword" || head.kind === "identifier") {
    const v = head.value.toLowerCase();
    if (v === "declare") return parseDeclareDeclaration(parser);
    if (v === "sub" || v === "function") return parseMethod(parser);
    if (v === "property") return parseProperty(parser);
    if (v === "class" || v === "structure") return parseClass(parser);
  }

  // Field declaration: `<modifier>* <name> As <Type>`
  return parseField(parser);
}
