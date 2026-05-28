/**
 * AST -> source serializer for the Data7 Basic parser.
 *
 * The serializer is the structural inverse of `parser.ts`. Given a
 * possibly mutated {@link CompilationUnit} (typically the output of
 * {@link GenericsMonomorphizer.monomorphize}), it emits an equivalent
 * `.bas` source string the downstream Data7 compiler can consume.
 *
 * Conventions:
 *
 *  - Indentation: 3 spaces per nesting level (matches the formatter and
 *    the canonical examples in `docs/exemple/`).
 *  - End-of-line: `\n` (lossy with respect to the original CR/LF, but
 *    consistent with how the rest of the pipeline emits source).
 *  - Headers (Class, Sub, Function, Delegate, Property, Field) are
 *    regenerated from their AST shape. The `<T>` parameter list is
 *    re-emitted only when the AST still carries `typeParameters` (the
 *    monomorphizer clears these on instantiated copies).
 *  - {@link OpaqueStatement} bodies are emitted verbatim and indented
 *    to the surrounding method depth.
 *
 * Out of scope: pretty-printing of expressions (we have no expression
 * AST for body statements yet). When the body parser grows past
 * OpaqueStatement, extend the helpers below to print those new shapes.
 */

import type {
  ClassDeclaration,
  CompilationUnit,
  DelegateDeclaration,
  FieldDeclaration,
  MethodDeclaration,
  NamespaceDeclaration,
  PropertyDeclaration,
  Statement,
  TopLevelMember,
  TypeParameter,
  TypeReference,
} from "../generics-monomorphizer/ast";

const INDENT_UNIT = "   ";

export interface SerializeOptions {
  /** Newline character to use. Defaults to `"\n"`. */
  readonly eol?: string;
}

export function serializeUnit(unit: CompilationUnit, options: SerializeOptions = {}): string {
  const lines: string[] = [];
  for (const m of unit.members) {
    serializeMember(m, 0, lines);
  }
  return lines.join(options.eol ?? "\n");
}

function serializeMember(member: TopLevelMember, depth: number, out: string[]): void {
  switch (member.kind) {
    case "NamespaceDeclaration":
      serializeNamespace(member, depth, out);
      return;
    case "ClassDeclaration":
      serializeClass(member, depth, out);
      return;
    case "MethodDeclaration":
      serializeMethod(member, depth, out);
      return;
    case "DelegateDeclaration":
      serializeDelegate(member, depth, out);
      return;
    case "VariableDeclaration":
      // Top-level Dim statements are extremely rare; emit verbatim.
      out.push(indent(depth) + emitVariableDeclaration(member));
      return;
    case "ExpressionStatement":
    case "Assignment":
    case "OpaqueStatement":
      out.push(indent(depth) + emitStatement(member));
      return;
    default: {
      const exhaustive: never = member;
      void exhaustive;
      return;
    }
  }
}

function serializeNamespace(ns: NamespaceDeclaration, depth: number, out: string[]): void {
  out.push(indent(depth) + `Namespace ${ns.name}`);
  for (const m of ns.members) {
    serializeMember(m, depth + 1, out);
  }
  out.push(indent(depth) + "End Namespace");
}

function serializeClass(klass: ClassDeclaration, depth: number, out: string[]): void {
  const header = `Class ${klass.name}${emitTypeParams(klass.typeParameters)}${
    klass.baseType ? " Inherits " + emitTypeRef(klass.baseType) : ""
  }`;
  out.push(indent(depth) + header);
  for (const member of klass.members) {
    if (member.kind === "MethodDeclaration") serializeMethod(member, depth + 1, out);
    else if (member.kind === "PropertyDeclaration") serializeProperty(member, depth + 1, out);
    else serializeField(member, depth + 1, out);
  }
  out.push(indent(depth) + "End Class");
}

function serializeMethod(m: MethodDeclaration, depth: number, out: string[]): void {
  const keyword = m.returnType !== undefined ? "Function" : "Sub";
  const params = m.parameters
    .map((p) => `${p.isByRef === true ? "ByRef " : ""}${p.name} As ${emitTypeRef(p.type)}`.trim())
    .join(", ");
  const ret = m.returnType !== undefined ? ` As ${emitTypeRef(m.returnType)}` : "";
  out.push(
    indent(depth) + `${keyword} ${m.name}${emitTypeParams(m.typeParameters)}(${params})${ret}`,
  );
  for (const s of m.body) {
    out.push(emitBodyStatement(s, depth + 1));
  }
  out.push(indent(depth) + `End ${keyword}`);
}

function serializeDelegate(d: DelegateDeclaration, depth: number, out: string[]): void {
  const keyword = d.returnType !== undefined ? "Function" : "Sub";
  const params = d.parameters
    .map((p) => `${p.isByRef === true ? "ByRef " : ""}${p.name} As ${emitTypeRef(p.type)}`.trim())
    .join(", ");
  const ret = d.returnType !== undefined ? ` As ${emitTypeRef(d.returnType)}` : "";
  out.push(
    indent(depth) +
      `Delegate ${keyword} ${d.name}${emitTypeParams(d.typeParameters)}(${params})${ret}`,
  );
}

function serializeProperty(p: PropertyDeclaration, depth: number, out: string[]): void {
  out.push(indent(depth) + `Public Property ${p.name} As ${emitTypeRef(p.type)}`);
}

function serializeField(f: FieldDeclaration, depth: number, out: string[]): void {
  out.push(indent(depth) + `Public ${f.name} As ${emitTypeRef(f.type)}`);
}

function emitBodyStatement(s: Statement, depth: number): string {
  if (s.kind === "OpaqueStatement") {
    // Preserve original indentation only when the source line is empty;
    // otherwise re-indent at the target depth so monomorphized clones
    // align with the surrounding scope.
    const trimmed = s.text.replace(/^\s+/, "");
    return indent(depth) + trimmed;
  }
  return indent(depth) + emitStatement(s);
}

function emitStatement(s: Statement): string {
  switch (s.kind) {
    case "OpaqueStatement":
      return s.text;
    case "VariableDeclaration":
      return emitVariableDeclaration(s);
    case "Assignment":
      return "<assignment>"; // Body assignments are not produced by the current parser.
    case "ExpressionStatement":
      return "<expr>"; // Body expressions are not produced by the current parser.
    default: {
      const exhaustive: never = s;
      void exhaustive;
      return "";
    }
  }
}

function emitVariableDeclaration(v: { name: string; type?: TypeReference }): string {
  return `Dim ${v.name}${v.type !== undefined ? " As " + emitTypeRef(v.type) : ""}`;
}

function emitTypeParams(params: readonly TypeParameter[]): string {
  if (params.length === 0) return "";
  return `<${params.map((p) => p.name).join(", ")}>`;
}

function emitTypeRef(t: TypeReference): string {
  if (t.typeArguments.length === 0) return t.name;
  return `${t.name}<${t.typeArguments.map(emitTypeRef).join(", ")}>`;
}

function indent(depth: number): string {
  let s = "";
  for (let i = 0; i < depth; i++) s += INDENT_UNIT;
  return s;
}
