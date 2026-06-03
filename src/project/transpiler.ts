import { parseInterpolation } from "../utils/interpolation";
import { inferLiteralType } from "../utils/literal-type-infer";
import { DependencyScanner } from "../analysis/dependency-scanner";
import type { EnumerableInfo } from "../analysis/enumerable-detector";
import { runGenericsViaAST } from "./generics-driver";
import { runGenericsPass, type GenericsPassWarning } from "./generics-pass";
import { parseBasic, parseExpr, serializeUnitWithMap } from "./parser";
import {
  ASTWalker,
  type Statement,
  type Expression,
  type MethodDeclaration,
  type VariableDeclaration,
  type ExpressionStatement,
  type Identifier,
  type MemberAccess,
  type MethodInvocation,
  type TypeReference,
  type TopLevelMember,
  type Node,
} from "./generics-monomorphizer/ast";

export interface SugarDiagnostic {
  readonly code:
    | "not-enumerable"
    | "invalid-interpolation"
    | "ternary-context-unsupported"
    | "null-coalesce-context-unsupported"
    | "optional-chain-context-unsupported"
    | "optional-chain-too-deep"
    | "unknown-template"
    | "generic-arity-mismatch"
    | "duplicate-template"
    | "class-generic-method-unsupported"
    | "flat-name-collision"
    | "instantiation-limit-exceeded";
  readonly line: number;
  readonly column: number;
  readonly typeName: string;
}

export interface TranspileContext {
  detectEnumerable(typeName: string, preferredElementType?: string): EnumerableInfo | undefined;
  readonly useAstGenerics?: boolean;
}

function mapGenericsWarning(warning: GenericsPassWarning): SugarDiagnostic {
  let typeName: string;
  if (warning.code === "generic-arity-mismatch") {
    typeName = `${warning.templateName ?? ""} expected=${String(warning.expected ?? 0)} actual=${String(warning.actual ?? 0)}`;
  } else if (warning.code === "flat-name-collision") {
    typeName = warning.flatName ?? "";
  } else {
    typeName = warning.templateName ?? "";
  }
  return {
    code: warning.code,
    line: warning.line ?? 0,
    column: warning.column ?? 0,
    typeName,
  };
}

export interface TranspileResult {
  readonly code: string;
  readonly diagnostics: readonly SugarDiagnostic[];
  readonly lineMap?: number[];
}

function buildVarDeclRegex(varName: string): RegExp {
  return new RegExp(`(?:^|[^A-Za-z0-9_])${varName}\\s+As\\s+(?:New\\s+)?([\\w.]+)`, "i");
}

function buildNewExprRegex(varName: string): RegExp {
  return new RegExp(`\\b${varName}\\s*=\\s*New\\s+([\\w.]+)\\s*\\(`, "i");
}

function inferOperandType(
  operand: string,
  lines: readonly string[],
  beforeLineIdx: number,
): string | undefined {
  if (!/^[A-Za-z_]\w*$/.test(operand)) return undefined;
  const declRegex = buildVarDeclRegex(operand);
  const newRegex = buildNewExprRegex(operand);
  for (let i = beforeLineIdx; i >= 0; i--) {
    const lineText = lines[i];
    if (lineText === undefined) continue;
    const cleanLine = DependencyScanner.stripComments(lineText);
    if (!cleanLine.trim()) continue;
    const declMatch = cleanLine.match(declRegex);
    if (declMatch?.[1]) return declMatch[1];
    const newMatch = cleanLine.match(newRegex);
    if (newMatch?.[1]) return newMatch[1];
  }
  return undefined;
}

function extractTrailingComment(line: string): string | undefined {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === "'") {
      return line.slice(i).trim() || undefined;
    }
  }
  return undefined;
}

interface InterpolationSegment {
  readonly isExpression: boolean;
  readonly text: string;
}

function splitInterpolatedString(str: string): InterpolationSegment[] {
  let content = str;
  if (content.startsWith("$")) content = content.slice(1);
  if (content.startsWith('"') && content.endsWith('"')) {
    content = content.slice(1, -1);
  }

  const segments: InterpolationSegment[] = [];
  let i = 0;
  let buffer = "";
  while (i < content.length) {
    const c = content[i];
    if (c === "{") {
      if (content[i + 1] === "{") {
        buffer += "{";
        i += 2;
        continue;
      }
      if (buffer) {
        segments.push({ isExpression: false, text: buffer });
        buffer = "";
      }
      i++;
      let depth = 1;
      let expr = "";
      while (i < content.length && depth > 0) {
        const cc = content[i];
        if (cc === "{") depth++;
        else if (cc === "}") {
          depth--;
          if (depth === 0) break;
        }
        expr += cc ?? "";
        i++;
      }
      segments.push({ isExpression: true, text: expr.trim() });
      i++;
      continue;
    }
    if (c === "}") {
      if (content[i + 1] === "}") {
        buffer += "}";
        i += 2;
        continue;
      }
    }
    buffer += c ?? "";
    i++;
  }
  if (buffer) {
    segments.push({ isExpression: false, text: buffer });
  }
  return segments;
}

// ---------------------------------------------------------------------------
// Text pre-pass rules (Enum, Destructuring, Auto-New, Object-Init)
// ---------------------------------------------------------------------------

const ENUM_HEADER_REGEX = /^(\s*)Enum\s+([A-Za-z_]\w*)(?:\s+As\s+BaseEnum)?\s*$/i;
function runEnumPrePass(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = ENUM_HEADER_REGEX.exec(DependencyScanner.stripComments(line));
    if (m) {
      const indent = m[1] ?? "";
      const enumName = m[2];
      if (enumName) {
        let endIdx = -1;
        const entries: { name: string; value: string }[] = [];
        for (let j = i + 1; j < lines.length; j++) {
          const ln = lines[j] ?? "";
          const clean = DependencyScanner.stripComments(ln).trim();
          if (!clean) continue;
          if (/^End\s+Enum\b/i.test(clean)) {
            endIdx = j;
            break;
          }
          const e = /^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/.exec(clean);
          if (e) {
            const name = e[1] ?? "";
            const value = (e[2] ?? `"${name}"`).trim();
            if (name) entries.push({ name, value });
          }
        }
        if (endIdx >= 0 && entries.length > 0) {
          const innerIndent = indent + "   ";
          out.push(`${indent}Class ${enumName}`);
          out.push(`${innerIndent}Inherits BaseEnum`);
          out.push("");
          out.push(`${innerIndent}Private Shared _Initialized As Boolean`);
          out.push("");
          out.push(`${innerIndent}Private Shared Sub Initialize()`);
          out.push(`${innerIndent}   If _Initialized Then Exit Sub`);
          entries.forEach((entry, idx) => {
            out.push(
              `${innerIndent}   BaseEnum._AddEnumItem("${enumName}", New ${enumName}(${idx}, ${entry.value}))`,
            );
          });
          out.push(`${innerIndent}   _Initialized = True`);
          out.push(`${innerIndent}End Sub`);
          for (const entry of entries) {
            out.push("");
            out.push(`${innerIndent}Shared Function ${entry.name} As ${enumName}`);
            out.push(`${innerIndent}   ${entry.name} = Load(${entry.value})`);
            out.push(`${innerIndent}End Function`);
          }
          out.push("");
          out.push(`${innerIndent}Shared Function Load(pValue As String) As ${enumName}`);
          out.push(`${innerIndent}   ${enumName}.Initialize()`);
          out.push(
            `${innerIndent}   Load = CType(BaseEnum._GetCache("${enumName}", pValue), ${enumName})`,
          );
          out.push(`${innerIndent}End Function`);
          out.push("");
          out.push(`${innerIndent}Shared Function GetOptions() As String`);
          out.push(`${innerIndent}   ${enumName}.Initialize()`);
          out.push(`${innerIndent}   GetOptions = BaseEnum._GetEnumOptions("${enumName}")`);
          out.push(`${innerIndent}End Function`);
          out.push(`${indent}End Class`);
          i = endIdx;
          continue;
        }
      }
    }
    out.push(line);
  }
  return out;
}

const DESTRUCTURE_OBJECT_REGEX = /^(\s*)Dim\s*\{\s*([^}]+?)\s*\}\s*=\s*(.+)$/i;
const DESTRUCTURE_ARRAY_REGEX = /^(\s*)Dim\s*\[\s*([^\]]+?)\s*\]\s*=\s*(.+)$/i;

function parseObjectDestructure(
  body: string,
): { local: string; member: string; defaultExpr?: string }[] | null {
  const parts = splitInitializerList(body);
  const result: { local: string; member: string; defaultExpr?: string }[] = [];
  for (const part of parts) {
    const m = /^(\w+)(?:\s+As\s+(\w+))?(?:\s*=\s*(.+))?$/i.exec(part.trim());
    if (!m) return null;
    const member = m[1] ?? "";
    const local = m[2] ?? member;
    const defaultExpr = m[3]?.trim();
    result.push({ local, member, defaultExpr });
  }
  return result;
}

function parseArrayDestructure(body: string): { local: string; isRest: boolean }[] | null {
  const parts = splitInitializerList(body);
  const result: { local: string; isRest: boolean }[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (text.startsWith("...")) {
      result.push({ local: text.slice(3).trim(), isRest: true });
    } else {
      result.push({ local: text, isRest: false });
    }
  }
  return result;
}

function splitInitializerList(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] ?? "";
    if (c === '"') {
      if (inString && raw[i + 1] === '"') {
        i++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      const segment = raw.slice(start, i).trim();
      if (segment) parts.push(segment);
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

const AUTO_NEW_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*)\s+As\s+New\s+([\w.]+)\s*$/i;

const OBJECT_INIT_REGEX =
  /^(\s*)(?:(Dim|Public|Private|Protected|Shared)\s+)?([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(?:As\s+([\w.]+)\s*)?=\s*(New\s+[\w.]+\s*\(.*?\))\s+With\s*\{\s*(.+?)\s*\}\s*$/i;

function runLinePrePasses(
  lines: string[],
  idxCounter: () => string,
  srcCounter: () => string,
): string[] {
  const out: string[] = [];
  // for (let i = 0; i < lines.length; i++) {
  for (const line of lines) {
    // const line = lines[i] ?? "";
    const cleanLine = DependencyScanner.stripComments(line);

    // Destructure Object
    const destObj = DESTRUCTURE_OBJECT_REGEX.exec(cleanLine);
    if (destObj) {
      const indent = destObj[1] ?? "";
      const body = destObj[2] ?? "";
      const source = (destObj[3] ?? "").trim();
      const bindings = parseObjectDestructure(body);
      if (bindings) {
        const trailingComment = extractTrailingComment(line);
        bindings.forEach((b, idx) => {
          const dim = `${indent}Dim ${b.local} = ${source}.${b.member}`;
          out.push(idx === 0 && trailingComment ? `${dim} ${trailingComment}` : dim);
          if (b.defaultExpr !== undefined) {
            out.push(
              `${indent}If ${b.local} = NULL Or ${b.local} = "" Then ${b.local} = ${b.defaultExpr}`,
            );
          }
        });
        continue;
      }
    }

    // Destructure Array
    const destArr = DESTRUCTURE_ARRAY_REGEX.exec(cleanLine);
    if (destArr) {
      const indent = destArr[1] ?? "";
      const body = destArr[2] ?? "";
      const source = (destArr[3] ?? "").trim();
      const bindings = parseArrayDestructure(body);
      if (bindings) {
        const trailingComment = extractTrailingComment(line);
        bindings.forEach((b, idx) => {
          if (b.isRest) {
            const restList = srcCounter();
            out.push(`${indent}Dim ${b.local} As StringList = New StringList()`);
            out.push(`${indent}For ${restList} = ${idx} To ${source}.Count - 1`);
            out.push(`${indent}   ${b.local}.Add(${source}.Item(${restList}))`);
            out.push(`${indent}Next`);
          } else {
            const dim = `${indent}Dim ${b.local} = ${source}.Item(${idx})`;
            out.push(idx === 0 && trailingComment ? `${dim} ${trailingComment}` : dim);
          }
        });
        continue;
      }
    }

    // Auto-New
    const autoNew = AUTO_NEW_REGEX.exec(cleanLine);
    if (autoNew) {
      const indent = autoNew[1] ?? "";
      const dimKeyword = autoNew[2] ?? "Dim";
      const target = autoNew[3];
      const typeName = autoNew[4];
      if (target && typeName) {
        const trailingComment = extractTrailingComment(line);
        const head = `${indent}${dimKeyword} ${target} As ${typeName} = New ${typeName}()`;
        out.push(trailingComment ? `${head} ${trailingComment}` : head);
        continue;
      }
    }

    // Object Init
    const objInit = OBJECT_INIT_REGEX.exec(cleanLine);
    if (objInit) {
      const indent = objInit[1] ?? "";
      const dimKeyword = objInit[2];
      const target = objInit[3];
      const asType = objInit[4];
      const newExpr = objInit[5];
      const initList = objInit[6] ?? "";
      if (target && newExpr) {
        const trailingComment = extractTrailingComment(line);
        const innerIndent = indent + "   ";
        const assignmentLine = dimKeyword
          ? asType
            ? `${indent}${dimKeyword} ${target} As ${asType} = ${newExpr}`
            : `${indent}${dimKeyword} ${target} = ${newExpr}`
          : `${indent}${target} = ${newExpr}`;
        out.push(trailingComment ? `${assignmentLine} ${trailingComment}` : assignmentLine);

        const inits = splitInitializerList(initList);
        out.push(`${indent}With ${target}`);
        for (const init of inits) {
          out.push(`${innerIndent}${init}`);
        }
        out.push(`${indent}End With`);
        continue;
      }
    }

    out.push(line);
  }
  return out;
}

const NUMERIC_SEPARATOR_TRANSFORM = {
  apply(line: string): string {
    if (!line.includes("_")) return line;
    let out = "";
    let i = 0;
    while (i < line.length) {
      const c = line[i] ?? "";
      if (c === "'") {
        out += line.substring(i);
        break;
      }
      if (c === '"') {
        out += '"';
        i++;
        while (i < line.length) {
          const cc = line[i] ?? "";
          if (cc === '"') {
            if (line[i + 1] === '"') {
              out += '""';
              i += 2;
              continue;
            }
            out += '"';
            i++;
            break;
          }
          out += cc;
          i++;
        }
        continue;
      }
      if (c === "$" && line[i + 1] === '"') {
        out += '$"';
        i += 2;
        while (i < line.length) {
          const cc = line[i] ?? "";
          if (cc === '"') {
            if (line[i + 1] === '"') {
              out += '""';
              i += 2;
              continue;
            }
            out += '"';
            i++;
            break;
          }
          out += cc;
          i++;
        }
        continue;
      }
      if (c >= "0" && c <= "9" && !/[A-Za-z0-9_]/.test(line[i - 1] ?? "")) {
        let j = i;
        while (j < line.length) {
          const cj = line[j] ?? "";
          if ((cj >= "0" && cj <= "9") || cj === "." || cj === "e" || cj === "E") {
            j++;
            continue;
          }
          if (
            cj === "_" &&
            (line[j - 1] ?? "") >= "0" &&
            (line[j - 1] ?? "") <= "9" &&
            (line[j + 1] ?? "") >= "0" &&
            (line[j + 1] ?? "") <= "9"
          ) {
            j++;
            continue;
          }
          break;
        }
        out += line.substring(i, j).replace(/_/g, "");
        i = j;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// AST Walker Transpiler
// ---------------------------------------------------------------------------

export class ASTSugarTransformer extends ASTWalker {
  public diagnostics: SugarDiagnostic[] = [];
  private srcCounter = 0;
  private idxCounter = 0;
  private currentMethod: MethodDeclaration | null = null;

  constructor(
    private readonly ctx: TranspileContext,
    private readonly allLines: string[],
  ) {
    super();
  }

  private freshIndex(): string {
    return `__idx${this.idxCounter++}`;
  }

  private freshSource(): string {
    return `__src${this.srcCounter++}`;
  }

  override walk(node: Node): void {
    if (node.kind === "CompilationUnit") {
      node.members = this.transformMembers(node.members);
      return;
    }
    if (node.kind === "NamespaceDeclaration") {
      node.members = this.transformMembers(node.members);
      return;
    }
    if (node.kind === "ClassDeclaration") {
      for (const m of node.members) {
        this.walk(m);
      }
      return;
    }
    if (node.kind === "MethodDeclaration") {
      const prevMethod = this.currentMethod;
      this.currentMethod = node;
      node.body = this.transformStatements(node.body);
      this.currentMethod = prevMethod;
      return;
    }
    super.walk(node);
  }

  private transformMembers(members: TopLevelMember[]): TopLevelMember[] {
    const result: TopLevelMember[] = [];
    for (const m of members) {
      if (
        m.kind === "NamespaceDeclaration" ||
        m.kind === "ClassDeclaration" ||
        m.kind === "MethodDeclaration" ||
        m.kind === "DelegateDeclaration"
      ) {
        this.walk(m);
        result.push(m);
      } else {
        // `VariableDeclaration` (top-level Dim/Const), OpaqueStatements, and
        // all other statement-like members go through `transformStatement` so
        // that sugar (ternary, null-coalescing, interpolation) in their
        // initializers is expanded — just as for method-local Dims.
        const transformed = this.transformStatement(m);
        if (Array.isArray(transformed)) {
          result.push(...(transformed as TopLevelMember[]));
        } else {
          result.push(transformed);
        }
      }
    }
    return result;
  }

  private transformStatements(stmts: Statement[]): Statement[] {
    const result: Statement[] = [];
    for (const s of stmts) {
      const transformed = this.transformStatement(s);
      if (Array.isArray(transformed)) {
        result.push(...transformed);
      } else {
        result.push(transformed);
      }
    }
    return result;
  }

  private transformStatement(s: Statement): Statement | Statement[] {
    switch (s.kind) {
      case "VariableDeclaration": {
        if (s.initializer) {
          s.initializer = this.transformExpression(s.initializer, true, s.loc?.startLine);
          if (s.initializer.kind === "TernaryExpression") {
            const cond = s.initializer.condition;
            const trueExpr = s.initializer.trueExpr;
            const falseExpr = s.initializer.falseExpr;
            const target: Identifier = { kind: "Identifier", name: s.name, loc: s.loc };
            const decl: VariableDeclaration = {
              kind: "VariableDeclaration",
              name: s.name,
              type: s.type,
              loc: s.loc,
            };
            return [
              decl,
              {
                kind: "IfStatement",
                condition: cond,
                thenBranch: [{ kind: "Assignment", target, value: trueExpr, loc: s.loc }],
                elseIfBranches: [],
                elseBranch: [{ kind: "Assignment", target, value: falseExpr, loc: s.loc }],
                loc: s.loc,
                comment: s.comment,
              },
            ];
          }
          if (s.initializer.kind === "NullCoalescingExpression") {
            const left = s.initializer.left;
            const right = s.initializer.right;
            const target: Identifier = { kind: "Identifier", name: s.name, loc: s.loc };
            const decl: VariableDeclaration = {
              kind: "VariableDeclaration",
              name: s.name,
              type: s.type,
              loc: s.loc,
            };
            const isComplex = this.isComplexExpression(left);
            if (isComplex) {
              const tempName = this.freshSource();
              const tempVar: Identifier = { kind: "Identifier", name: tempName, loc: s.loc };
              const tempDecl: VariableDeclaration = {
                kind: "VariableDeclaration",
                name: tempName,
                initializer: left,
                loc: s.loc,
              };
              return [
                decl,
                tempDecl,
                {
                  kind: "IfStatement",
                  condition: {
                    kind: "BinaryExpression",
                    left: tempVar,
                    operator: "=",
                    right: { kind: "Literal", value: null, loc: s.loc },
                    loc: s.loc,
                  },
                  thenBranch: [{ kind: "Assignment", target, value: right, loc: s.loc }],
                  elseIfBranches: [],
                  elseBranch: [{ kind: "Assignment", target, value: tempVar, loc: s.loc }],
                  loc: s.loc,
                  comment: s.comment,
                },
              ];
            } else {
              return [
                decl,
                {
                  kind: "IfStatement",
                  condition: {
                    kind: "BinaryExpression",
                    left,
                    operator: "=",
                    right: { kind: "Literal", value: null, loc: s.loc },
                    loc: s.loc,
                  },
                  thenBranch: [{ kind: "Assignment", target, value: right, loc: s.loc }],
                  elseIfBranches: [],
                  elseBranch: [{ kind: "Assignment", target, value: left, loc: s.loc }],
                  loc: s.loc,
                  comment: s.comment,
                },
              ];
            }
          }
          if (s.initializer.kind === "OptionalChainingExpression") {
            const depth = this.countOptionalChainDepth(s.initializer);
            if (depth > 3) {
              this.diagnostics.push({
                code: "optional-chain-too-deep",
                line: (s.loc?.startLine ?? 1) - 1,
                column: s.loc?.startChar ?? 0,
                typeName: String(depth),
              });
              return s;
            }
            const base = this.getOptionalChainBase(s.initializer);
            const native = this.stripOptionalChain(s.initializer);
            const target: Identifier = { kind: "Identifier", name: s.name, loc: s.loc };
            return [
              { kind: "VariableDeclaration", name: s.name, type: s.type, loc: s.loc },
              {
                kind: "IfStatement",
                condition: {
                  kind: "BinaryExpression",
                  left: base,
                  operator: "<>",
                  right: { kind: "Literal", value: null, loc: s.loc },
                  loc: s.loc,
                },
                thenBranch: [{ kind: "Assignment", target, value: native, loc: s.loc }],
                elseIfBranches: [],
                loc: s.loc,
              },
            ];
          }
        }
        return s;
      }

      case "Assignment": {
        s.target = this.transformExpression(s.target, false, s.loc?.startLine);
        s.value = this.transformExpression(s.value, true, s.loc?.startLine);

        if (s.operator === "??=") {
          const target = s.target;
          return {
            kind: "IfStatement",
            condition: {
              kind: "BinaryExpression",
              left: target,
              operator: "=",
              right: { kind: "Literal", value: null, loc: s.loc },
              loc: s.loc,
            },
            thenBranch: [{ kind: "Assignment", target, value: s.value, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }
        if (s.operator === "||=") {
          const target = s.target;
          return {
            kind: "IfStatement",
            condition: { kind: "UnaryExpression", operator: "Not", argument: target, loc: s.loc },
            thenBranch: [{ kind: "Assignment", target, value: s.value, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }
        if (s.operator === "&&=") {
          const target = s.target;
          return {
            kind: "IfStatement",
            condition: target,
            thenBranch: [{ kind: "Assignment", target, value: s.value, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }

        if (s.value.kind === "TernaryExpression") {
          const cond = s.value.condition;
          const trueExpr = s.value.trueExpr;
          const falseExpr = s.value.falseExpr;
          return {
            kind: "IfStatement",
            condition: cond,
            thenBranch: [{ kind: "Assignment", target: s.target, value: trueExpr, loc: s.loc }],
            elseIfBranches: [],
            elseBranch: [{ kind: "Assignment", target: s.target, value: falseExpr, loc: s.loc }],
            loc: s.loc,
            comment: s.comment,
          };
        }

        if (s.value.kind === "NullCoalescingExpression") {
          const left = s.value.left;
          const right = s.value.right;
          const isComplex = this.isComplexExpression(left);
          if (isComplex) {
            const tempName = this.freshSource();
            const tempVar: Identifier = { kind: "Identifier", name: tempName, loc: s.loc };
            const tempDecl: VariableDeclaration = {
              kind: "VariableDeclaration",
              name: tempName,
              initializer: left,
              loc: s.loc,
            };
            return [
              tempDecl,
              {
                kind: "IfStatement",
                condition: {
                  kind: "BinaryExpression",
                  left: tempVar,
                  operator: "=",
                  right: { kind: "Literal", value: null, loc: s.loc },
                  loc: s.loc,
                },
                thenBranch: [{ kind: "Assignment", target: s.target, value: right, loc: s.loc }],
                elseIfBranches: [],
                elseBranch: [{ kind: "Assignment", target: s.target, value: tempVar, loc: s.loc }],
                loc: s.loc,
                comment: s.comment,
              },
            ];
          } else {
            return {
              kind: "IfStatement",
              condition: {
                kind: "BinaryExpression",
                left,
                operator: "=",
                right: { kind: "Literal", value: null, loc: s.loc },
                loc: s.loc,
              },
              thenBranch: [{ kind: "Assignment", target: s.target, value: right, loc: s.loc }],
              elseIfBranches: [],
              elseBranch: [{ kind: "Assignment", target: s.target, value: left, loc: s.loc }],
              loc: s.loc,
              comment: s.comment,
            };
          }
        }

        if (s.value.kind === "OptionalChainingExpression") {
          const depth = this.countOptionalChainDepth(s.value);
          if (depth > 3) {
            this.diagnostics.push({
              code: "optional-chain-too-deep",
              line: (s.loc?.startLine ?? 1) - 1,
              column: s.loc?.startChar ?? 0,
              typeName: String(depth),
            });
            return s;
          }
          const base = this.getOptionalChainBase(s.value);
          const native = this.stripOptionalChain(s.value);
          return {
            kind: "IfStatement",
            condition: {
              kind: "BinaryExpression",
              left: base,
              operator: "<>",
              right: { kind: "Literal", value: null, loc: s.loc },
              loc: s.loc,
            },
            thenBranch: [{ kind: "Assignment", target: s.target, value: native, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }
        return s;
      }

      case "ExpressionStatement": {
        const isCall = s.expression.kind === "OptionalChainingExpression";
        s.expression = this.transformExpression(s.expression, isCall, s.loc?.startLine);
        if (s.expression.kind === "OptionalChainingExpression") {
          const depth = this.countOptionalChainDepth(s.expression);
          if (depth > 3) {
            this.diagnostics.push({
              code: "optional-chain-too-deep",
              line: (s.loc?.startLine ?? 1) - 1,
              column: s.loc?.startChar ?? 0,
              typeName: String(depth),
            });
            return s;
          }
          const base = this.getOptionalChainBase(s.expression);
          const native = this.stripOptionalChain(s.expression);
          return {
            kind: "IfStatement",
            condition: {
              kind: "BinaryExpression",
              left: base,
              operator: "<>",
              right: { kind: "Literal", value: null, loc: s.loc },
              loc: s.loc,
            },
            thenBranch: [{ kind: "ExpressionStatement", expression: native, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }
        return s;
      }

      case "IfStatement": {
        s.condition = this.transformExpression(s.condition, false, s.loc?.startLine);
        s.thenBranch = this.transformStatements(s.thenBranch);
        for (const branch of s.elseIfBranches) {
          branch.condition = this.transformExpression(branch.condition, false, s.loc?.startLine);
          branch.body = this.transformStatements(branch.body);
        }
        if (s.elseBranch) s.elseBranch = this.transformStatements(s.elseBranch);
        return s;
      }

      case "ForStatement": {
        s.start = this.transformExpression(s.start, false, s.loc?.startLine);
        s.end = this.transformExpression(s.end, false, s.loc?.startLine);
        if (s.step) s.step = this.transformExpression(s.step, false, s.loc?.startLine);
        s.body = this.transformStatements(s.body);
        return s;
      }

      case "ForEachStatement": {
        s.enumerable = this.transformExpression(s.enumerable, false, s.loc?.startLine);

        // Range loop: For Each i In start..end
        if (s.enumerable.kind === "BinaryExpression" && s.enumerable.operator === "..") {
          s.body = this.transformStatements(s.body);
          return {
            kind: "ForStatement",
            counter: s.elementVar,
            start: s.enumerable.left,
            end: s.enumerable.right,
            body: s.body,
            loc: s.loc,
            comment: s.comment,
          };
        }

        // Enumerable collection loop
        const operandType = this.inferType(s.enumerable);
        const enumerableInfo = operandType
          ? this.ctx.detectEnumerable(operandType, s.elementType?.name)
          : undefined;

        if (!enumerableInfo) {
          s.body = this.transformStatements(s.body);
          this.diagnostics.push({
            code: "not-enumerable",
            line: (s.loc?.startLine ?? 1) - 1,
            column: s.loc?.startChar ?? 0,
            typeName: operandType ?? "Variant",
          });
          return s;
        }

        const elementTypeStr = s.elementType ? s.elementType.name : enumerableInfo.elementType;
        const elementTypeRef: TypeReference = s.elementType ?? {
          kind: "TypeReference",
          name: elementTypeStr,
          typeArguments: [],
          loc: s.loc,
        };

        const isComplex = this.isComplexExpression(s.enumerable);
        const srcVarName = isComplex ? this.freshSource() : "";
        const srcRef = isComplex
          ? { kind: "Identifier" as const, name: srcVarName, loc: s.loc }
          : s.enumerable;
        const idxVarName = this.freshIndex();
        const idxVar: Identifier = { kind: "Identifier", name: idxVarName, loc: s.loc };

        // Now transform the body!
        s.body = this.transformStatements(s.body);

        const statements: Statement[] = [];
        if (isComplex) {
          statements.push({
            kind: "VariableDeclaration",
            name: srcVarName,
            initializer: s.enumerable,
            loc: s.loc,
          });
        }

        const countExpr: MemberAccess = {
          kind: "MemberAccess",
          target: srcRef,
          member: enumerableInfo.countMember,
          loc: s.loc,
        };

        const indexerCall: MethodInvocation = {
          kind: "MethodInvocation",
          callee: srcRef,
          methodName: enumerableInfo.indexerMember,
          typeArguments: [],
          arguments: [idxVar],
          loc: s.loc,
        };

        const elementDecl: VariableDeclaration = {
          kind: "VariableDeclaration",
          name: s.elementVar.name,
          type: elementTypeRef,
          initializer: indexerCall,
          loc: s.loc,
          comment: s.comment,
        };

        statements.push({
          kind: "ForStatement",
          counter: idxVar,
          start: { kind: "Literal", value: 0, loc: s.loc },
          end: {
            kind: "BinaryExpression",
            left: countExpr,
            operator: "-",
            right: { kind: "Literal", value: 1, loc: s.loc },
            loc: s.loc,
          },
          body: [elementDecl, ...s.body],
          loc: s.loc,
        });

        return statements;
      }

      case "WhileStatement": {
        s.condition = this.transformExpression(s.condition, false, s.loc?.startLine);
        s.body = this.transformStatements(s.body);
        return s;
      }

      case "TryCatchStatement": {
        s.tryBody = this.transformStatements(s.tryBody);
        s.catchBody = this.transformStatements(s.catchBody);
        if (s.finallyBody) s.finallyBody = this.transformStatements(s.finallyBody);
        return s;
      }

      case "UsingStatement": {
        s.body = this.transformStatements(s.body);
        const resourceDecl: VariableDeclaration = {
          kind: "VariableDeclaration",
          name: s.resourceVar.name,
          type: s.resourceType,
          initializer: {
            kind: "ObjectCreationExpression",
            type: s.resourceType,
            arguments: s.resourceArgs,
            loc: s.loc,
          },
          loc: s.loc,
        };

        const freeCall: ExpressionStatement = {
          kind: "ExpressionStatement",
          expression: {
            kind: "MethodInvocation",
            callee: s.resourceVar,
            methodName: "Free",
            typeArguments: [],
            arguments: [],
            loc: s.loc,
          },
          loc: s.loc,
        };

        return [
          resourceDecl,
          {
            kind: "TryCatchStatement",
            tryBody: s.body,
            catchBody: [],
            finallyBody: [freeCall],
            loc: s.loc,
          },
        ];
      }

      case "MatchStatement": {
        s.subject = this.transformExpression(s.subject, false, s.loc?.startLine);
        let condition: Expression | undefined;
        const thenBranch: Statement[] = [];
        const elseIfBranches: { condition: Expression; body: Statement[] }[] = [];
        let elseBranch: Statement[] | undefined;
        let first = true;
        for (const c of s.cases) {
          c.body = this.transformStatements(c.body);
          if (c.isElse) {
            elseBranch = c.body;
          } else {
            const typeName = c.typeName ?? "";
            const isCheck: MethodInvocation = {
              kind: "MethodInvocation",
              callee: s.subject,
              methodName: "InheritsFrom",
              typeArguments: [],
              arguments: [{ kind: "Identifier", name: typeName, loc: s.loc }],
              loc: s.loc,
            };
            if (first) {
              condition = isCheck;
              thenBranch.push(...c.body);
              first = false;
            } else {
              elseIfBranches.push({ condition: isCheck, body: c.body });
            }
          }
        }
        if (!condition) {
          return { kind: "Block", statements: elseBranch ?? [], loc: s.loc };
        }
        return {
          kind: "IfStatement",
          condition,
          thenBranch,
          elseIfBranches,
          elseBranch,
          loc: s.loc,
        };
      }

      case "ReturnStatement": {
        if (s.expression?.kind === "TernaryExpression") {
          const cond = this.transformExpression(s.expression.condition, false, s.loc?.startLine);
          const trueExpr = this.transformExpression(s.expression.trueExpr, false, s.loc?.startLine);
          const falseExpr = this.transformExpression(
            s.expression.falseExpr,
            false,
            s.loc?.startLine,
          );
          return [
            {
              kind: "IfStatement",
              condition: cond,
              thenBranch: [{ kind: "ReturnStatement", expression: trueExpr, loc: s.loc }],
              elseIfBranches: [],
              loc: s.loc,
              singleLine: true,
              comment: s.comment,
            },
            {
              kind: "ReturnStatement",
              expression: falseExpr,
              loc: s.loc,
            },
          ];
        }
        if (s.expression) {
          s.expression = this.transformExpression(s.expression, false, s.loc?.startLine);
        }
        return s;
      }

      case "WithStatement": {
        s.expression = this.transformExpression(s.expression, false, s.loc?.startLine);
        s.body = this.transformStatements(s.body);
        return s;
      }

      case "Block": {
        s.statements = this.transformStatements(s.statements);
        return s;
      }

      case "OpaqueStatement":
        return s;
    }
  }

  private transformExpression(
    e: Expression,
    isAssignmentRhsOrCallStatementContext: boolean,
    startLine?: number,
  ): Expression {
    switch (e.kind) {
      case "Literal":
      case "Identifier":
        return e;

      case "ObjectCreationExpression":
        e.arguments = e.arguments.map((arg) => this.transformExpression(arg, false, startLine));
        return e;

      case "MethodInvocation": {
        if (e.callee) {
          e.callee = this.transformExpression(
            e.callee,
            isAssignmentRhsOrCallStatementContext,
            startLine,
          );
        }
        e.arguments = e.arguments.map((arg) => this.transformExpression(arg, false, startLine));
        return e;
      }
      case "MemberAccess":
        e.target = this.transformExpression(
          e.target,
          isAssignmentRhsOrCallStatementContext,
          startLine,
        );
        return e;

      case "BinaryExpression":
        e.left = this.transformExpression(e.left, false, startLine);
        e.right = this.transformExpression(e.right, false, startLine);
        if (e.operator === "&") {
          e.left = this.ensureStringExpression(e.left, startLine);
          e.right = this.ensureStringExpression(e.right, startLine);
        } else if (e.operator === "+") {
          const leftType = this.inferType(e.left, startLine);
          const rightType = this.inferType(e.right, startLine);
          if (leftType?.toLowerCase() === "string" || rightType?.toLowerCase() === "string") {
            e.left = this.ensureStringExpression(e.left, startLine);
            e.right = this.ensureStringExpression(e.right, startLine);
          }
        }
        return e;

      case "UnaryExpression":
        e.argument = this.transformExpression(e.argument, false, startLine);
        return e;

      case "TernaryExpression":
        e.condition = this.transformExpression(e.condition, false, startLine);
        e.trueExpr = this.transformExpression(e.trueExpr, false, startLine);
        e.falseExpr = this.transformExpression(e.falseExpr, false, startLine);
        if (!isAssignmentRhsOrCallStatementContext) {
          this.diagnostics.push({
            code: "ternary-context-unsupported",
            line: (startLine ?? 1) - 1,
            column: e.loc?.startChar ?? 0,
            typeName: "non-assignment",
          });
        }
        return e;

      case "NullCoalescingExpression":
        e.left = this.transformExpression(e.left, false, startLine);
        e.right = this.transformExpression(e.right, false, startLine);
        if (!isAssignmentRhsOrCallStatementContext) {
          this.diagnostics.push({
            code: "null-coalesce-context-unsupported",
            line: (startLine ?? 1) - 1,
            column: e.loc?.startChar ?? 0,
            typeName: "non-assignment",
          });
        }
        return e;

      case "OptionalChainingExpression":
        e.target = this.transformExpression(
          e.target,
          isAssignmentRhsOrCallStatementContext,
          startLine,
        );
        e.member = this.transformExpression(
          e.member,
          isAssignmentRhsOrCallStatementContext,
          startLine,
        );
        if (!isAssignmentRhsOrCallStatementContext) {
          this.diagnostics.push({
            code: "optional-chain-context-unsupported",
            line: (startLine ?? 1) - 1,
            column: e.loc?.startChar ?? 0,
            typeName: "non-assignment-non-call",
          });
        }
        return e;

      case "PipeExpression": {
        const left = this.transformExpression(e.left, false, startLine);
        const right = e.right;
        if (right.kind === "MethodInvocation") {
          right.callee = right.callee
            ? this.transformExpression(right.callee, false, startLine)
            : undefined;
          right.arguments = right.arguments.map((arg) =>
            this.transformExpression(arg, false, startLine),
          );
          right.arguments.unshift(left);
          return right;
        }
        if (right.kind === "MemberAccess") {
          const target = this.transformExpression(right.target, false, startLine);
          return {
            kind: "MethodInvocation",
            callee: target,
            methodName: right.member,
            typeArguments: [],
            arguments: [left],
            loc: e.loc,
          };
        }
        if (right.kind === "Identifier") {
          return {
            kind: "MethodInvocation",
            methodName: right.name,
            typeArguments: [],
            arguments: [left],
            loc: e.loc,
          };
        }
        return {
          kind: "MethodInvocation",
          callee: right,
          methodName: "",
          typeArguments: [],
          arguments: [left],
          loc: e.loc,
        };
      }

      case "TaggedTemplateExpression": {
        const res = parseInterpolation(e.body);
        if (res.diagnostics.length > 0) {
          for (const d of res.diagnostics) {
            this.diagnostics.push({
              code: "invalid-interpolation",
              line: (e.loc?.startLine ?? 1) - 1,
              column: (e.loc?.startChar ?? 0) + d.column + e.tag.length,
              typeName: d.reason,
            });
          }
          return e;
        }

        const segments = splitInterpolatedString(e.body);
        if (e.tag === "") {
          if (segments.length === 0) {
            return { kind: "Literal", value: `""`, loc: e.loc };
          }
          let expr: Expression | null = null;
          for (const seg of segments) {
            let segmentExpr: Expression;
            if (seg.isExpression) {
              try {
                segmentExpr = parseExpr(seg.text);
                segmentExpr.parenthesized = true;
              } catch (_) {
                segmentExpr = {
                  kind: "Identifier",
                  name: seg.text,
                  loc: e.loc,
                  parenthesized: true,
                };
              }
              segmentExpr = this.transformExpression(segmentExpr, false, startLine);
              segmentExpr = this.ensureStringExpression(segmentExpr, startLine);
            } else {
              segmentExpr = { kind: "Literal", value: `"${seg.text}"`, loc: e.loc };
            }
            if (expr === null) {
              expr = segmentExpr;
            } else {
              expr = {
                kind: "BinaryExpression",
                left: expr,
                operator: "&",
                right: segmentExpr,
                loc: e.loc,
              };
            }
          }
          return expr ?? { kind: "Literal", value: `""`, loc: e.loc };
        } else {
          const args: Expression[] = [];

          // for (let idx = 0; idx < segments.length; idx++) {
          //   const seg = segments[idx];
          for (const seg of segments) {
            // if (!seg) continue;
            if (seg.isExpression) {
              const lastArg = args[args.length - 1];
              if (args.length === 0) {
                args.push({ kind: "Literal", value: `""`, loc: e.loc });
              } else if (lastArg && lastArg.kind !== "Literal") {
                args.push({ kind: "Literal", value: `""`, loc: e.loc });
              }

              try {
                const argExpr = parseExpr(seg.text);
                argExpr.parenthesized = true;
                args.push(argExpr);
              } catch (_) {
                args.push({ kind: "Identifier", name: seg.text, loc: e.loc, parenthesized: true });
              }
            } else {
              args.push({ kind: "Literal", value: `"${seg.text}"`, loc: e.loc });
            }
          }

          const lastArg = args[args.length - 1];
          if (args.length === 0) {
            args.push({ kind: "Literal", value: `""`, loc: e.loc });
          } else if (lastArg && lastArg.kind !== "Literal") {
            args.push({ kind: "Literal", value: `""`, loc: e.loc });
          }

          return {
            kind: "MethodInvocation",
            callee: { kind: "Identifier", name: e.tag, loc: e.loc },
            methodName: "Build",
            typeArguments: [],
            arguments: args,
            loc: e.loc,
          };
        }
      }
    }
  }

  private isComplexExpression(expr: Expression): boolean {
    if (expr.kind === "Identifier") return false;
    if (expr.kind === "MemberAccess") return this.isComplexExpression(expr.target);
    return true;
  }

  private countOptionalChainDepth(expr: Expression): number {
    if (expr.kind === "OptionalChainingExpression") {
      return 1 + this.countOptionalChainDepth(expr.target);
    }
    return 0;
  }

  private getOptionalChainBase(expr: Expression): Expression {
    if (expr.kind === "OptionalChainingExpression") {
      return this.getOptionalChainBase(expr.target);
    }
    return expr;
  }

  private stripOptionalChain(expr: Expression): Expression {
    if (expr.kind === "OptionalChainingExpression") {
      const target = this.stripOptionalChain(expr.target);
      const member = expr.member;
      if (member.kind === "MethodInvocation") {
        return {
          kind: "MethodInvocation",
          callee: target,
          methodName: member.methodName,
          typeArguments: member.typeArguments,
          arguments: member.arguments,
          loc: expr.loc,
        };
      } else if (member.kind === "MemberAccess") {
        return {
          kind: "MemberAccess",
          target: target,
          member: member.member,
          loc: expr.loc,
        };
      }
    }
    return expr;
  }

  private inferType(expr: Expression, startLine?: number): string | undefined {
    if (expr.kind === "Literal") {
      if (expr.value === null) return "Variant";
      return inferLiteralType(String(expr.value));
    }
    if (expr.kind === "Identifier") {
      const line = startLine ?? expr.loc?.startLine ?? 1;
      return inferOperandType(expr.name, this.allLines, line - 1);
    }
    if (expr.kind === "BinaryExpression") {
      if (expr.operator === "&") return "String";
      if (expr.operator === "+") {
        const leftType = this.inferType(expr.left, startLine);
        const rightType = this.inferType(expr.right, startLine);
        if (leftType?.toLowerCase() === "string" || rightType?.toLowerCase() === "string") {
          return "String";
        }
      }
    }
    if (expr.kind === "TaggedTemplateExpression" && expr.tag === "") {
      return "String";
    }
    return undefined;
  }

  private ensureStringExpression(expr: Expression, startLine?: number): Expression {
    // If it's a string literal, keep it as is
    if (expr.kind === "Literal" && typeof expr.value === "string" && expr.value.startsWith('"')) {
      return expr;
    }

    const type = this.inferType(expr, startLine);
    if (type) {
      const typeLower = type.toLowerCase();
      if (typeLower === "string") {
        return expr;
      }

      const primitives = new Set([
        "integer",
        "double",
        "boolean",
        "single",
        "extended",
        "tdatetime",
      ]);
      if (primitives.has(typeLower) || typeLower.startsWith("t")) {
        return {
          kind: "MethodInvocation",
          callee: expr,
          methodName: "ToString",
          typeArguments: [],
          arguments: [],
          loc: expr.loc,
        };
      }
    }

    // Default fallback: wrap in CStr(expr)
    return {
      kind: "MethodInvocation",
      callee: undefined,
      methodName: "CStr",
      typeArguments: [],
      arguments: [expr],
      loc: expr.loc,
    };
  }
}

// ---------------------------------------------------------------------------
// SugarTranspiler — barrel class
// ---------------------------------------------------------------------------

export class SugarTranspiler {
  public static transpile(code: string, ctx: TranspileContext): TranspileResult {
    // 1. Run generics pass (monomorphization)
    const useAst = ctx.useAstGenerics === true;
    const genericsResult = useAst ? runGenericsViaAST(code) : runGenericsPass(code);
    const monomorphic = genericsResult.code;

    const eol = monomorphic.includes("\r\n") ? "\r\n" : "\n";
    let lines = monomorphic.split(/\r?\n/);

    // 2. Pre-process lines with text pre-passes
    // Numeric separators
    lines = lines.map((line) => NUMERIC_SEPARATOR_TRANSFORM.apply(line));

    // Enum
    lines = runEnumPrePass(lines);

    // Destructuring / Auto-New / Object-Init
    let idxVal = 0;
    let srcVal = 0;
    lines = runLinePrePasses(
      lines,
      () => `__idx${idxVal++}`,
      () => `__src${srcVal++}`,
    );

    const processedCode = lines.join(eol);

    // 3. Parse to AST (Check if has structural definitions first)
    const tempParse = parseBasic(processedCode);
    const hasStructural = tempParse.unit.members.some(
      (m) =>
        m.kind === "NamespaceDeclaration" ||
        m.kind === "ClassDeclaration" ||
        m.kind === "MethodDeclaration" ||
        m.kind === "DelegateDeclaration",
    );

    let finalUnit = tempParse.unit;
    let transformerLines = lines;
    let wrapped = false;

    if (!hasStructural) {
      wrapped = true;
      const wrappedCode = `Sub __syntheticMethod()${eol}${processedCode}${eol}End Sub`;
      finalUnit = parseBasic(wrappedCode).unit;
      transformerLines = [`Sub __syntheticMethod()`, ...lines, `End Sub`];
    }

    // 4. Transform AST-to-AST
    const transformer = new ASTSugarTransformer(ctx, transformerLines);
    transformer.walk(finalUnit);

    // 5. Serialize AST back to code text, generating the lineMap!
    let serializeResult = serializeUnitWithMap(finalUnit, { eol });

    if (wrapped) {
      // Strip Sub __syntheticMethod() and End Sub
      const outputLines = serializeResult.code.split(/\r?\n/);
      if (outputLines.length >= 2) {
        const firstLine = lines.find((l) => l.trim().length > 0) ?? "";
        const matchIndent = /^\s*/.exec(firstLine);
        const originalIndent = matchIndent ? matchIndent[0] : "";

        const bodyLines = outputLines.slice(1, -1);
        const unindented = bodyLines.map((line) => {
          let cleanLine = line;
          if (line.startsWith("   ")) {
            cleanLine = line.slice(3);
          }
          return originalIndent + cleanLine;
        });
        serializeResult = {
          code: unindented.join(eol),
          lineMap: serializeResult.lineMap.slice(1, -1).map((x) => x - 1),
        };
      }
      transformer.diagnostics = transformer.diagnostics.map((diag) => ({
        ...diag,
        line: diag.line - 1,
      }));
    }

    // 6. Merge diagnostics
    const diagnostics: SugarDiagnostic[] = [];
    for (const warning of genericsResult.warnings) {
      diagnostics.push(mapGenericsWarning(warning));
    }
    diagnostics.push(...transformer.diagnostics);

    return {
      code: serializeResult.code,
      diagnostics,
      lineMap: serializeResult.lineMap,
    };
  }
}
