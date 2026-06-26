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
  ParameterDeclaration,
  IfStatement,
  ForStatement,
  ForEachStatement,
  WhileStatement,
  TryCatchStatement,
  UsingStatement,
  OpaqueStatement,
  ImportsDeclaration,
  WithStatement,
  Expression,
  SourceLocation,
  Assignment,
  VariableDeclaration,
  EnumDeclaration,
  DestructuredVariableDeclaration,
  SelectCaseStatement,
  MethodInvocation,
} from "../ast/ast";
import { deepClone } from "../ast/clone";
import { obfuscateLocalVariables } from "./serializer/local-obfuscator";
export { obfuscateLocalVariables } from "./serializer/local-obfuscator";

const INDENT_UNIT = "   ";

export interface SerializeOptions {
  /** Newline character to use. Defaults to `"\n"`. */
  readonly eol?: string;
  /** Strip indentation and comments. */
  readonly minify?: boolean;
  /** Obfuscate method-local variables. */
  readonly obfuscate?: boolean;
  /** Omit explicit/default Public on class fields and properties. */
  readonly omitPublicFieldModifiers?: boolean;
}

export interface SerializeResult {
  readonly code: string;
  readonly lineMap: number[];
}

export interface OutputBuffer {
  push(text: string): void;
  setLine(loc?: SourceLocation): void;
}

// class SimpleBuffer implements OutputBuffer {
//   constructor(public readonly lines: string[] = []) {}
//   push(text: string) {
//     this.lines.push(text);
//   }
//   setLine(loc?: SourceLocation) {}
// }

class MappedBuffer implements OutputBuffer {
  public readonly lines: string[] = [];
  public readonly lineMap: number[] = [];
  private currentLine = 0;

  push(text: string): void {
    this.lines.push(text);
    this.lineMap.push(this.currentLine);
  }

  setLine(loc?: SourceLocation): void {
    if (loc) {
      this.currentLine = loc.startLine - 1;
    }
  }
}

export function serializeUnit(unit: CompilationUnit, options: SerializeOptions = {}): string {
  return serializeUnitWithMap(unit, options).code;
}

export function serializeUnitWithMap(
  unit: CompilationUnit,
  options: SerializeOptions = {},
): SerializeResult {
  let targetUnit = unit;
  if (options.obfuscate) {
    targetUnit = deepClone(unit);
    obfuscateLocalVariables(targetUnit);
  }

  const buffer = new MappedBuffer();
  for (const m of targetUnit.members) {
    serializeMember(m, 0, buffer, options);
  }

  const eol = options.eol ?? "\n";
  return {
    code: buffer.lines.join(eol),
    lineMap: buffer.lineMap,
  };
}

function serializeMember(
  member: TopLevelMember,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  switch (member.kind) {
    case "NamespaceDeclaration":
      serializeNamespace(member, depth, out, options);
      return;
    case "ClassDeclaration":
      serializeClass(member, depth, out, options);
      return;
    case "MethodDeclaration":
      serializeMethod(member, depth, out, options);
      return;
    case "DelegateDeclaration":
      serializeDelegate(member, depth, out, options);
      return;
    case "FieldDeclaration":
      serializeField(member, depth, out, options);
      return;
    case "VariableDeclaration":
    case "ExpressionStatement":
    case "Assignment":
    case "OpaqueStatement":
    case "IfStatement":
    case "ForStatement":
    case "ForEachStatement":
    case "WhileStatement":
    case "TryCatchStatement":
    case "UsingStatement":
    case "ReturnStatement":
    case "ExitStatement":
    case "ContinueStatement":
    case "ThrowStatement":
    case "Block":
    case "WithStatement":
    case "EnumDeclaration":
    case "DestructuredVariableDeclaration":
    case "SelectCaseStatement":
      serializeStatement(member, depth, out, options);
      return;
    case "ImportsDeclaration":
      serializeImports(member, depth, out, options);
      return;
    default: {
      const exhaustive: never = member;
      void exhaustive;
      return;
    }
  }
}

function capitalize(word: string): string {
  if (!word) return "";
  const lower = word.toLowerCase();
  if (lower === "readonly") return "ReadOnly";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function emitModifiers(mods?: string[]): string {
  if (mods && mods.length > 0) {
    return mods.map(capitalize).join(" ") + " ";
  }
  return "";
}

function emitFieldModifiers(mods: string[] | undefined, options: SerializeOptions): string {
  if (mods && mods.length > 0) {
    const visibleMods = options.omitPublicFieldModifiers
      ? mods.filter((m) => m.toLowerCase() !== "public")
      : mods;
    if (visibleMods.length === 0) return "";
    return visibleMods.map(capitalize).join(" ") + " ";
  }
  if (options.omitPublicFieldModifiers) return "";
  return "Public ";
}

function serializeNamespace(
  ns: NamespaceDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(ns.loc);
  out.push(
    indent(depth, options) +
      `Namespace ${ns.name}` +
      (ns.comment && !options.minify ? " " + ns.comment : ""),
  );
  for (const m of ns.members) {
    serializeMember(m, depth + 1, out, options);
  }
  out.push(indent(depth, options) + "End Namespace");
}

function serializeClass(
  klass: ClassDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(klass.loc);
  const isStructure = klass.modifiers?.some((m) => m.toLowerCase() === "structure") ?? false;
  const filteredModifiers = klass.modifiers?.filter((m) => m.toLowerCase() !== "structure");
  const keyword = isStructure ? "Structure" : "Class";

  const header = `${emitModifiers(filteredModifiers)}${keyword} ${klass.name}${emitTypeParams(klass.typeParameters)}${
    klass.baseType
      ? "\n" + indent(depth + 1, options) + "Inherits " + emitTypeRef(klass.baseType)
      : ""
  }`;
  out.push(
    indent(depth, options) + header + (klass.comment && !options.minify ? " " + klass.comment : ""),
  );
  for (const member of klass.members) {
    if (member.kind === "MethodDeclaration") {
      serializeMethod(member, depth + 1, out, options);
    } else if (member.kind === "PropertyDeclaration") {
      serializeProperty(member, depth + 1, out, options);
    } else if (member.kind === "ClassDeclaration") {
      serializeClass(member, depth + 1, out, options);
    } else {
      serializeField(member, depth + 1, out, options);
    }
  }
  out.push(indent(depth, options) + `End ${keyword}`);
}

function serializeMethod(
  m: MethodDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(m.loc);
  const keyword = m.returnType !== undefined ? "Function" : "Sub";
  const params = m.parameters.map(emitParameter).join(", ");
  const ret = m.returnType !== undefined ? ` As ${emitTypeRef(m.returnType)}` : "";
  const paramsStr = m.noParentheses ? "" : `(${params})`;
  out.push(
    indent(depth, options) +
      `${emitModifiers(m.modifiers)}${keyword} ${m.name}${emitTypeParams(m.typeParameters)}${paramsStr}${ret}` +
      (m.comment && !options.minify ? " " + m.comment : ""),
  );
  for (const s of m.body) {
    serializeStatement(s, depth + 1, out, options);
  }
  out.push(indent(depth, options) + `End ${keyword}`);
}

function serializeDelegate(
  d: DelegateDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(d.loc);
  const keyword = d.returnType !== undefined ? "Function" : "Sub";
  const params = d.parameters.map(emitParameter).join(", ");
  const ret = d.returnType !== undefined ? ` As ${emitTypeRef(d.returnType)}` : "";
  const paramsStr = d.noParentheses ? "" : `(${params})`;
  out.push(
    indent(depth, options) +
      `${emitModifiers(d.modifiers)}Delegate ${keyword} ${d.name}${emitTypeParams(d.typeParameters)}${paramsStr}${ret}` +
      (d.comment && !options.minify ? " " + d.comment : ""),
  );
}

// Substitua a função serializeProperty por esta:
function serializeProperty(
  p: PropertyDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(p.loc);
  const isBlock = p.hasBlock || (p.getter ?? p.setter);

  const params = p.parameters ? p.parameters.map(emitParameter).join(", ") : "";
  const paramsStr = p.parameters ? `(${params})` : "";

  out.push(
    indent(depth, options) +
      `${emitFieldModifiers(p.modifiers, options)}Property ${p.name}${paramsStr} As ${emitTypeRef(p.type)}` +
      (p.comment && !options.minify ? " " + p.comment : ""),
  );

  if (isBlock) {
    if (p.getter) {
      out.setLine(p.getter.loc);
      out.push(indent(depth + 1, options) + `${emitModifiers(p.getter.modifiers)}Get`);
      for (const s of p.getter.body) {
        serializeStatement(s, depth + 2, out, options);
      }
      out.push(indent(depth + 1, options) + "End Get");
    }
    if (p.setter) {
      out.setLine(p.setter.loc);
      const params = p.setter.parameters.map(emitParameter).join(", ");
      const paramsStr = p.setter.noParentheses ? "" : `(${params})`;
      out.push(indent(depth + 1, options) + `${emitModifiers(p.setter.modifiers)}Set${paramsStr}`);
      for (const s of p.setter.body) {
        serializeStatement(s, depth + 2, out, options);
      }
      out.push(indent(depth + 1, options) + "End Set");
    }
    out.push(indent(depth, options) + "End Property");
  }
}

// function serializeProperty(
//   p: PropertyDeclaration,
//   depth: number,
//   out: OutputBuffer,
//   options: SerializeOptions,
// ): void {
//   out.setLine(p.loc);
//   out.push(
//     indent(depth, options) +
//       `${emitFieldModifiers(p.modifiers)}Property ${p.name} As ${emitTypeRef(p.type)}` +
//       (p.comment && !options.minify ? " " + p.comment : ""),
//   );
// }

function serializeField(
  f: FieldDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(f.loc);
  const initStr = f.initializer ? ` = ${emitExpression(f.initializer)}` : "";
  const dimensionsStr = emitNativeArrayDimensions(f.nativeArrayDimensions);
  out.push(
    indent(depth, options) +
      `${emitFieldModifiers(f.modifiers, options)}${f.name}${dimensionsStr} As ${emitTypeRef(f.type)}${initStr}` +
      (f.comment && !options.minify ? " " + f.comment : ""),
  );
}

function serializeStatement(
  s: Statement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(s.loc);
  switch (s.kind) {
    case "OpaqueStatement":
      // In minified mode, skip comment-only opaque lines
      if (options.minify && s.text.trim().startsWith("'")) return;
      out.push(emitBodyStatement(s, depth, options));
      return;
    case "VariableDeclaration":
      out.push(
        indent(depth, options) +
          emitVariableDeclaration(s) +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "Assignment":
      out.push(
        indent(depth, options) +
          emitAssignment(s) +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "ExpressionStatement":
      out.push(
        indent(depth, options) +
          emitExpression(s.expression) +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "IfStatement":
      serializeIfStatement(s, depth, out, options);
      return;
    case "ForStatement":
      serializeForStatement(s, depth, out, options);
      return;
    case "ForEachStatement":
      serializeForEachStatement(s, depth, out, options);
      return;
    case "WhileStatement":
      serializeWhileStatement(s, depth, out, options);
      return;
    case "TryCatchStatement":
      serializeTryCatchStatement(s, depth, out, options);
      return;
    case "UsingStatement":
      serializeUsingStatement(s, depth, out, options);
      return;
    case "SelectCaseStatement":
      serializeSelectCase(s, depth, out, options);
      return;
    case "WithStatement":
      serializeWithStatement(s, depth, out, options);
      return;
    case "ReturnStatement":
      out.push(
        indent(depth, options) +
          `Return${s.expression ? " " + emitExpression(s.expression) : ""}` +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "ExitStatement":
      out.push(
        indent(depth, options) +
          `Exit ${s.target}` +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "ContinueStatement":
      out.push(
        indent(depth, options) + "Continue" + (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "ThrowStatement":
      out.push(
        indent(depth, options) +
          `Throw ${emitExpression(s.expression)}` +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    case "Block":
      for (const stmt of s.statements) {
        serializeStatement(stmt, depth, out, options);
      }
      return;
    case "EnumDeclaration":
      serializeEnum(s, depth, out, options);
      return;
    case "DestructuredVariableDeclaration":
      out.push(
        indent(depth, options) +
          emitDestructuredVariableDeclaration(s) +
          (s.comment && !options.minify ? " " + s.comment : ""),
      );
      return;
    default: {
      const exhaustive: never = s;
      void exhaustive;
      return;
    }
  }
}

function emitBodyStatement(s: OpaqueStatement, depth: number, options: SerializeOptions): string {
  if (depth === 0 && !options.minify) return s.text;
  const trimmed = s.text.replace(/^\s+/, "");
  return indent(depth, options) + trimmed;
}

function emitVariableDeclaration(v: VariableDeclaration): string {
  const dimensionsStr = emitNativeArrayDimensions(v.nativeArrayDimensions);
  const typeStr = v.type !== undefined ? " As " + emitTypeRef(v.type) : "";
  const initStr = v.initializer !== undefined ? " = " + emitExpression(v.initializer) : "";
  return `${v.isConst ? "Const " : "Dim "}${v.name}${dimensionsStr}${typeStr}${initStr}`;
}

function emitNativeArrayDimensions(dimensions: readonly Expression[] | undefined): string {
  if (dimensions === undefined || dimensions.length === 0) return "";
  return `(${dimensions.map(emitExpression).join(", ")})`;
}

function emitAssignment(s: Assignment): string {
  const op = s.operator ?? "=";
  if (op === "+=" || op === "-=" || op === "*=" || op === "/=") {
    const baseOp = op.charAt(0);
    const targetStr = emitExpression(s.target);
    return `${targetStr} = ${targetStr} ${baseOp} ${emitExpression(s.value)}`;
  }
  return `${emitExpression(s.target)} ${op} ${emitExpression(s.value)}`;
}

function emitExpression(expr: Expression): string {
  const raw = emitExpressionRaw(expr);
  if (expr.parenthesized) return `(${raw})`;
  return raw;
}

function emitExpressionRaw(expr: Expression): string {
  switch (expr.kind) {
    case "Literal":
      if (expr.value === null) return "NULL";
      if (typeof expr.value === "string") {
        return expr.value;
      }
      if (typeof expr.value === "boolean") {
        return expr.value ? "True" : "False";
      }
      return String(expr.value);
    case "Identifier":
      return expr.name;
    case "ObjectCreationExpression": {
      const newArgs = expr.arguments.map(emitExpression).join(", ");
      return `New ${emitTypeRef(expr.type)}(${newArgs})`;
    }
    case "MethodInvocation": {
      const typeOfExpr = emitTypeOfExpression(expr);
      if (typeOfExpr !== undefined) return typeOfExpr;
      const callArgs = expr.arguments.map(emitExpression).join(", ");
      const typeArgs =
        expr.typeArguments.length > 0 ? `<${expr.typeArguments.map(emitTypeRef).join(", ")}>` : "";
      const receiver = expr.callee
        ? emitExpression(expr.callee) + (expr.methodName ? "." : "")
        : "";
      if (expr.noParentheses) {
        return `${receiver}${expr.methodName}${typeArgs} ${callArgs}`;
      }
      return `${receiver}${expr.methodName}${typeArgs}(${callArgs})`;
    }
    case "MemberAccess":
      return `${emitExpression(expr.target)}.${expr.member}`;
    case "ArrayAccessExpression":
      return `${emitExpression(expr.target)}[${emitExpression(expr.index)}]`;
    case "BinaryExpression":
      return `${emitExpression(expr.left)} ${expr.operator} ${emitExpression(expr.right)}`;
    case "UnaryExpression": {
      const op = expr.operator.toLowerCase() === "not" ? "Not " : expr.operator;
      return `${op}${emitExpression(expr.argument)}`;
    }
    case "TernaryExpression":
      return `${emitExpression(expr.condition)} ? ${emitExpression(expr.trueExpr)} : ${emitExpression(expr.falseExpr)}`;
    case "NullCoalescingExpression":
      return `${emitExpression(expr.left)} ?? ${emitExpression(expr.right)}`;
    case "OptionalChainingExpression": {
      if (expr.member.kind === "MethodInvocation") {
        // const callee = expr.member.callee ? "." + emitExpression(expr.member.callee) : "";
        const callArgs = expr.member.arguments.map(emitExpression).join(", ");
        const typeArgs =
          expr.member.typeArguments.length > 0
            ? `<${expr.member.typeArguments.map(emitTypeRef).join(", ")}>`
            : "";
        return `${emitExpression(expr.target)}?.${expr.member.methodName}${typeArgs}(${callArgs})`;
      } else {
        const memberName = expr.member.kind === "MemberAccess" ? expr.member.member : "";
        return `${emitExpression(expr.target)}?.${memberName}`;
      }
    }
    case "PipeExpression":
      return `${emitExpression(expr.left)} |> ${emitExpression(expr.right)}`;
    case "TaggedTemplateExpression":
      return `${expr.tag}$"${expr.body}"`;
    case "ObjectInitializerExpression": {
      const argsStr = expr.arguments.map(emitExpression).join(", ");
      const assignmentsStr = expr.assignments
        .map((a) => `.${a.member} = ${emitExpression(a.value)}`)
        .join(", ");
      return `New ${emitTypeRef(expr.type)}(${argsStr}) With { ${assignmentsStr} }`;
    }
    case "ArrayLiteralExpression":
      return `[${expr.elements.map(emitExpression).join(", ")}]`;
    case "SpreadExpression":
      return `...${emitExpression(expr.expression)}`;
    case "ArrowFunctionExpression": {
      const params = expr.parameters.map(emitParameter).join(", ");
      const retType = expr.returnType ? ` As ${emitTypeRef(expr.returnType)}` : "";
      if (Array.isArray(expr.body)) {
        return `(${params})${retType} => { ... }`;
      }
      return `(${params})${retType} => ${emitExpression(expr.body)}`;
    }
    case "TypeReferenceExpression":
      return emitTypeRef(expr.type);
    default: {
      const exhaustive: never = expr;
      void exhaustive;
      return "";
    }
  }
}

function emitTypeOfExpression(expr: MethodInvocation): string | undefined {
  if (expr.callee || expr.methodName.toLowerCase() !== "typeof" || expr.arguments.length !== 2) {
    return undefined;
  }

  const checkedExpr = expr.arguments[0];
  const typeExpr = expr.arguments[1];
  if (checkedExpr === undefined || typeExpr?.kind !== "TypeReferenceExpression") {
    return undefined;
  }

  const checked = emitExpression(checkedExpr);
  const separator = checkedExpr.parenthesized ? "" : " ";
  return `TypeOf${separator}${checked} Is ${emitTypeRef(typeExpr.type)}`;
}

function emitStatementInline(s: Statement): string {
  switch (s.kind) {
    case "ReturnStatement":
      return `Return${s.expression ? " " + emitExpression(s.expression) : ""}`;
    case "Assignment":
      return emitAssignment(s);
    case "ExpressionStatement":
      return emitExpression(s.expression);
    case "VariableDeclaration":
      return emitVariableDeclaration(s);
    case "ExitStatement":
      return `Exit ${s.target}`;
    case "ContinueStatement":
      return "Continue";
    case "ThrowStatement":
      return `Throw ${emitExpression(s.expression)}`;
    default:
      return "";
  }
}

function serializeIfStatement(
  s: IfStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  if (s.singleLine) {
    const thenStr = s.thenBranch.map(emitStatementInline).join(" : ");
    const elseStr =
      s.elseBranch && s.elseBranch.length > 0
        ? " Else " + s.elseBranch.map(emitStatementInline).join(" : ")
        : "";
    out.push(
      indent(depth, options) +
        `If ${emitExpression(s.condition)} Then ${thenStr}${elseStr}` +
        (s.comment && !options.minify ? " " + s.comment : ""),
    );
    return;
  }
  out.push(
    indent(depth, options) +
      `If ${emitExpression(s.condition)} Then` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.thenBranch) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  for (const branch of s.elseIfBranches) {
    out.push(indent(depth, options) + `ElseIf ${emitExpression(branch.condition)} Then`);
    for (const stmt of branch.body) {
      serializeStatement(stmt, depth + 1, out, options);
    }
  }
  if (s.elseBranch) {
    out.push(indent(depth, options) + "Else");
    for (const stmt of s.elseBranch) {
      serializeStatement(stmt, depth + 1, out, options);
    }
  }
  out.push(indent(depth, options) + "End If");
}

function serializeForStatement(
  s: ForStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  const stepStr = s.step ? ` Step ${emitExpression(s.step)}` : "";
  out.push(
    indent(depth, options) +
      `For ${emitExpression(s.counter)} = ${emitExpression(s.start)} To ${emitExpression(s.end)}${stepStr}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.body) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  out.push(indent(depth, options) + `Next`);
}

function serializeForEachStatement(
  s: ForEachStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  const typeStr = s.elementType ? ` As ${emitTypeRef(s.elementType)}` : "";
  out.push(
    indent(depth, options) +
      `For Each ${emitExpression(s.elementVar)}${typeStr} In ${emitExpression(s.enumerable)}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.body) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  out.push(indent(depth, options) + `Next`);
}

function serializeWhileStatement(
  s: WhileStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.push(
    indent(depth, options) +
      `While ${emitExpression(s.condition)}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.body) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  out.push(indent(depth, options) + `End While`);
}

function serializeTryCatchStatement(
  s: TryCatchStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.push(indent(depth, options) + "Try" + (s.comment && !options.minify ? " " + s.comment : ""));
  for (const stmt of s.tryBody) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  const varStr = s.catchVar ? ` ${s.catchVar.name}` : "";
  const typeStr = s.catchType ? ` As ${emitTypeRef(s.catchType)}` : "";
  out.push(indent(depth, options) + `Catch${varStr}${typeStr}`);
  for (const stmt of s.catchBody) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  if (s.finallyBody) {
    out.push(indent(depth, options) + "Finally");
    for (const stmt of s.finallyBody) {
      serializeStatement(stmt, depth + 1, out, options);
    }
  }
  out.push(indent(depth, options) + "End Try");
}

function serializeUsingStatement(
  s: UsingStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  const argsStr =
    s.resourceArgs.length > 0 ? `(${s.resourceArgs.map(emitExpression).join(", ")})` : "";
  out.push(
    indent(depth, options) +
      `Using ${s.resourceVar.name} As ${emitTypeRef(s.resourceType)}${argsStr}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.body) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  out.push(indent(depth, options) + "End Using");
}

function serializeWithStatement(
  s: WithStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.push(
    indent(depth, options) +
      `With ${emitExpression(s.expression)}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );
  for (const stmt of s.body) {
    serializeStatement(stmt, depth + 1, out, options);
  }
  out.push(indent(depth, options) + "End With");
}

function emitTypeParams(params: readonly TypeParameter[]): string {
  if (params.length === 0) return "";
  return `<${params.map((p) => p.name).join(", ")}>`;
}

function emitTypeRef(t: TypeReference): string {
  if (t.typeArguments.length === 0) return t.name;
  return `${t.name}<${t.typeArguments.map(emitTypeRef).join(", ")}>`;
}

function emitParameter(p: ParameterDeclaration): string {
  const byRef = p.isByRef === true ? "ByRef " : "";
  const defaultValue = p.defaultValue ? ` = ${emitExpression(p.defaultValue)}` : "";
  return `${byRef}${p.name} As ${emitTypeRef(p.type)}${defaultValue}`.trim();
}

function indent(depth: number, options: SerializeOptions): string {
  if (options.minify) return "";
  let s = "";
  for (let i = 0; i < depth; i++) s += INDENT_UNIT;
  return s;
}

// Atualize a função obfuscateLocalVariables:
/* Legacy implementation retained temporarily for source-history context.
function legacyObfuscateLocalVariables(unit: CompilationUnit): void {
  const walker = new (class extends ASTWalker {
    protected override visitTypeReference(_: TypeReference): void {
      //do nothing
    }
    override walk(node: Node): void {
      if (node.kind === "MethodDeclaration") {
        new LocalObfuscator().obfuscate(node);
        return;
      }
      if (node.kind === "PropertyDeclaration") {
        if (node.getter) new LocalObfuscator().obfuscate(node.getter);
        if (node.setter) new LocalObfuscator().obfuscate(node.setter);
      }
      super.walk(node);
    }
  })();
  walker.walk(unit);
}

*/
function serializeEnum(
  e: EnumDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(e.loc);
  const keyword = e.isSugar ? "Enun" : "Enum";
  const baseStr = !e.isSugar && e.baseType ? ` As ${emitTypeRef(e.baseType)}` : "";
  out.push(
    indent(depth, options) +
      `${emitModifiers(e.modifiers)}${keyword} ${e.name}${baseStr}` +
      (e.comment && !options.minify ? " " + e.comment : ""),
  );
  for (const entry of e.entries) {
    const valStr = entry.value ? " = " + emitExpression(entry.value) : "";
    out.push(indent(depth + 1, options) + `${entry.name}${valStr}`);
  }
  out.push(indent(depth, options) + `End ${keyword}`);
}

function emitDestructuredVariableDeclaration(d: DestructuredVariableDeclaration): string {
  const open = d.isObject ? "{" : "[";
  const close = d.isObject ? "}" : "]";
  const bindingsStr = d.bindings
    .map((b) => {
      if (b.isRest) return `...${b.name}`;
      const propStr = b.property ? `${b.property} As ` : "";
      const defaultStr = b.defaultValue ? " = " + emitExpression(b.defaultValue) : "";
      return `${propStr}${b.name}${defaultStr}`;
    })
    .join(", ");
  return `Dim ${open} ${bindingsStr} ${close} = ${emitExpression(d.initializer)}`;
}

// export function obfuscateLocalVariables(unit: CompilationUnit): void {
//   const walker = new (class extends ASTWalker {
//     protected override visitTypeReference(_: TypeReference): void {
//       //do nothing
//     }
//     override walk(node: Node): void {
//       if (node.kind === "MethodDeclaration") {
//         new LocalObfuscator().obfuscate(node);
//         return;
//       }
//       super.walk(node);
//     }
//   })();
//   walker.walk(unit);
// }

function serializeImports(
  imp: ImportsDeclaration,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.setLine(imp.loc);
  out.push(
    indent(depth, options) +
      `Imports ${imp.target}` +
      (imp.comment && !options.minify ? " " + imp.comment : ""),
  );
}

function serializeSelectCase(
  s: SelectCaseStatement,
  depth: number,
  out: OutputBuffer,
  options: SerializeOptions,
): void {
  out.push(
    indent(depth, options) +
      `Select Case ${emitExpression(s.expression)}` +
      (s.comment && !options.minify ? " " + s.comment : ""),
  );

  for (const c of s.cases) {
    out.setLine(c.loc);
    if (c.isElse) {
      out.push(
        indent(depth + 1, options) +
          "Case Else" +
          (c.comment && !options.minify ? " " + c.comment : ""),
      );
    } else {
      const valuesStr = c.values.map((v) => emitExpression(v)).join(", ");
      out.push(
        indent(depth + 1, options) +
          `Case ${valuesStr}` +
          (c.comment && !options.minify ? " " + c.comment : ""),
      );
    }

    for (const stmt of c.body) {
      serializeStatement(stmt, depth + 2, out, options);
    }
  }

  out.push(indent(depth, options) + "End Select");
}
