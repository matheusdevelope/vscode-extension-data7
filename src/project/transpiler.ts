import { parseInterpolation } from "../utils/interpolation";
import { inferLiteralType } from "../utils/literal-type-infer";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { SugarEngine, SugarRegistry, type SugarEngineOptions } from "./sugars";
import type { EnumerableInfo } from "../analysis/enumerable-detector";
import {
  GenericsMonomorphizer,
  type ExternalGenericTemplate,
  flatNameFromParts,
  type MonomorphizationWarning,
  type RequestedGenericInstantiation,
} from "./generics";
import { parseBasic, parseExpr, serializeUnitWithMap, GenericsParserPlugin } from "./parser";
import {
  ASTWalker,
  type Statement,
  type Expression,
  type VariableDeclaration,
  type ExpressionStatement,
  type Identifier,
  type MemberAccess,
  type MethodInvocation,
  type TypeReference,
  type TopLevelMember,
  type Node,
  type ClassDeclaration,
  type ClassMember,
  type ObjectCreationExpression,
  type Assignment,
  type BinaryExpression,
  type WithStatement,
} from "./ast/ast";

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
  isTypeDescendantOf?(typeName: string, baseTypeName: string): boolean | undefined;
  resolveTypeImport?(typeName: string): string | undefined;
  externalGenericTemplates?: readonly ExternalGenericTemplate[];
  requestedGenericInstantiations?: readonly RequestedGenericInstantiation[];
  sugarOptions?: SugarEngineOptions;
}

function mapGenericsWarning(warning: MonomorphizationWarning): SugarDiagnostic {
  let typeName: string;
  let code: SugarDiagnostic["code"];

  if (warning.code === "arity-mismatch") {
    code = "generic-arity-mismatch";
    typeName = warning.templateName ?? "";
  } else if (warning.code === "invalid-input") {
    // Treat invalid-input as unknown-template or handle it cleanly.
    // In builder.ts, invalid-input is low-level AST warning, so we can map it to unknown-template or keep a generic mapping.
    code = "unknown-template";
    typeName = warning.message;
  } else {
    code = warning.code;
    if (warning.code === "flat-name-collision") {
      typeName = warning.flatName ?? "";
    } else {
      typeName = warning.templateName ?? "";
    }
  }

  return {
    code,
    line: 0,
    column: 0,
    typeName,
  };
}

export interface TranspileResult {
  readonly code: string;
  readonly diagnostics: readonly SugarDiagnostic[];
  readonly lineMap?: number[];
  readonly usedSugars?: Set<string>;
}

function buildVarDeclRegex(varName: string): RegExp {
  return new RegExp(
    `(?:^|[^A-Za-z0-9_])${varName}(?:\\s*\\[\\])?\\s+As\\s+(?:New\\s+)?([\\w.]+)`,
    "i",
  );
}

function buildNewExprRegex(varName: string): RegExp {
  return new RegExp(`\\b${varName}\\s*=\\s*New\\s+([\\w.]+)\\s*\\(`, "i");
}

function normalizeMetaProgrammingSyntax(line: string): string {
  if (/^\s*<#/.test(line)) return line;
  return line
    .replace(/\b([A-Za-z_]\w*)_<\s*([A-Za-z_]\w*)\s*>/g, "$1<$2>")
    .replace(/(?<![A-Za-z0-9_])<\s*([A-Za-z_]\w*)\s*>/g, "$1");
}

function inferOperandType(
  operand: string,
  lines: readonly string[],
  beforeLineIdx: number,
): string | undefined {
  if (!/^[A-Za-z_]\w*$/.test(operand)) return undefined;
  const declRegex = buildVarDeclRegex(operand);
  const newRegex = buildNewExprRegex(operand);
  const literalAssignRegex = new RegExp(
    `(?:^|[^A-Za-z0-9_])(?:dim\\s+)?${operand}\\s*=\\s*(.+)`,
    "i",
  );

  for (let i = beforeLineIdx; i >= 0; i--) {
    const lineText = lines[i];
    if (lineText === undefined) continue;
    const cleanLine = DependencyScanner.stripComments(lineText);
    if (!cleanLine.trim()) continue;
    const declMatch = cleanLine.match(declRegex);
    if (declMatch?.[1]) return declMatch[1];
    const newMatch = cleanLine.match(newRegex);
    if (newMatch?.[1]) return newMatch[1];
    const assignMatch = cleanLine.match(literalAssignRegex);
    if (assignMatch?.[1]) {
      const type = inferLiteralType(assignMatch[1]);
      if (type) return type;
    }
  }
  return undefined;
}

function collectDeclaredTypeNames(unit: { members: TopLevelMember[] }): Set<string> {
  const names = new Set<string>();
  const visitMembers = (members: readonly TopLevelMember[]): void => {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        visitMembers(member.members);
      } else if (
        member.kind === "ClassDeclaration" ||
        member.kind === "DelegateDeclaration" ||
        member.kind === "MethodDeclaration"
      ) {
        names.add(member.name.toLowerCase());
      }
    }
  };
  visitMembers(unit.members);
  return names;
}

function collectNamespaceNames(unit: { members: TopLevelMember[] }): Set<string> {
  const names = new Set<string>();
  for (const member of unit.members) {
    if (member.kind === "NamespaceDeclaration") {
      names.add(member.name.toLowerCase());
    }
  }
  return names;
}

function extractTypeNamesFromTypeArg(typeArg: string): string[] {
  const names: string[] = [];
  const matches = typeArg.matchAll(/[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/g);
  for (const match of matches) {
    const name = match[0];
    if (name) names.push(name);
  }
  return names;
}

function injectImportsForMaterializedGenericInstantiations(
  unit: { members: TopLevelMember[]; loc?: Node["loc"] },
  ctx: TranspileContext,
): void {
  if (!ctx.resolveTypeImport || !ctx.requestedGenericInstantiations) return;

  const declaredTypeNames = collectDeclaredTypeNames(unit);
  const namespaceNames = collectNamespaceNames(unit);
  const existingImports = new Set(
    unit.members
      .filter((member) => member.kind === "ImportsDeclaration")
      .map((member) => member.target.toLowerCase()),
  );
  const importsToAdd: string[] = [];

  for (const request of ctx.requestedGenericInstantiations) {
    const flatName = flatNameFromParts(
      request.templateName,
      request.typeArgs.map((arg) => ({
        kind: "TypeReference" as const,
        name: arg,
        typeArguments: [],
      })),
    );
    if (!declaredTypeNames.has(flatName.toLowerCase())) continue;

    for (const typeArg of request.typeArgs) {
      for (const typeName of extractTypeNamesFromTypeArg(typeArg)) {
        // console.log(typeName);
        const namespace = ctx.resolveTypeImport(typeName);
        if (!namespace) continue;
        const key = namespace.toLowerCase();
        if (existingImports.has(key) || namespaceNames.has(key)) continue;
        existingImports.add(key);
        importsToAdd.push(namespace);
      }
    }
  }

  if (importsToAdd.length === 0) return;

  let insertIdx = 0;
  for (let i = 0; i < unit.members.length; i++) {
    if (unit.members[i]?.kind === "ImportsDeclaration") {
      insertIdx = i + 1;
    }
  }
  unit.members.splice(
    insertIdx,
    0,
    ...importsToAdd.map((target) => ({
      kind: "ImportsDeclaration" as const,
      target,
      loc: unit.loc,
    })),
  );
}
// extractTrailingComment removed

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

// Dead code block and helper functions removed

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
  public readonly usedSugars = new Set<string>();
  private srcCounter = 0;
  private idxCounter = 0;

  constructor(
    private readonly ctx: TranspileContext,
    private readonly allLines: string[],
    private readonly sugarEngine: SugarEngine,
  ) {
    super();
  }

  private isSugarEnabled(id: string): boolean {
    return this.sugarEngine.isEnabled(id);
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

      // Auto-inject imports for all used sugars
      for (const utility of SugarRegistry.getUtilityModules(this.usedSugars)) {
        if (utility.namespace) {
          const hasImport = node.members.some(
            (m) => m.kind === "ImportsDeclaration" && m.target === utility.namespace,
          );
          if (!hasImport) {
            let insertIdx = 0;
            for (let i = 0; i < node.members.length; i++) {
              const member = node.members[i];
              if (member?.kind === "ImportsDeclaration") {
                insertIdx = i + 1;
              }
            }
            node.members.splice(insertIdx, 0, {
              kind: "ImportsDeclaration",
              target: utility.namespace,
              loc: node.loc,
            });
          }
        }
      }

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
      node.body = this.transformStatements(node.body);
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
      } else if (m.kind === "ImportsDeclaration") {
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
    return this.transformStatementRaw(s);
  }

  private transformStatementRaw(s: Statement): Statement | Statement[] {
    switch (s.kind) {
      case "VariableDeclaration": {
        if (
          this.isSugarEnabled("object-initializer") &&
          s.initializer?.kind === "ObjectInitializerExpression"
        ) {
          const objInit = s.initializer;
          const target: Identifier = { kind: "Identifier", name: s.name, loc: s.loc };
          const creation: ObjectCreationExpression = {
            kind: "ObjectCreationExpression",
            type: objInit.type,
            arguments: objInit.arguments,
            loc: objInit.loc,
          };
          const decl: VariableDeclaration = {
            kind: "VariableDeclaration",
            name: s.name,
            type: s.type,
            initializer: creation,
            loc: s.loc,
          };
          const withBody: Statement[] = objInit.assignments.map((assoc) => {
            const val = this.transformExpression(assoc.value, true, s.loc?.startLine);
            return {
              kind: "Assignment",
              target: {
                kind: "MemberAccess",
                target: { kind: "Identifier", name: "", loc: s.loc },
                member: assoc.member,
                loc: s.loc,
              },
              value: val,
              loc: s.loc,
            };
          });
          const withStmt: WithStatement = {
            kind: "WithStatement",
            expression: target,
            body: withBody,
            loc: s.loc,
          };
          return [decl, withStmt];
        }

        if (s.initializer) {
          s.initializer = this.transformExpression(s.initializer, true, s.loc?.startLine);
          if (this.isSugarEnabled("ternary") && s.initializer.kind === "TernaryExpression") {
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
          if (
            this.isSugarEnabled("null-coalesce") &&
            s.initializer.kind === "NullCoalescingExpression"
          ) {
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
          if (
            this.isSugarEnabled("optional-chain") &&
            s.initializer.kind === "OptionalChainingExpression"
          ) {
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
        if (
          this.isSugarEnabled("object-initializer") &&
          s.value.kind === "ObjectInitializerExpression"
        ) {
          const objInit = s.value;
          const target = this.transformExpression(s.target, false, s.loc?.startLine);
          const creation: ObjectCreationExpression = {
            kind: "ObjectCreationExpression",
            type: objInit.type,
            arguments: objInit.arguments,
            loc: objInit.loc,
          };
          const assign: Assignment = {
            kind: "Assignment",
            target,
            value: creation,
            loc: s.loc,
          };
          const withBody: Statement[] = objInit.assignments.map((assoc) => {
            const val = this.transformExpression(assoc.value, true, s.loc?.startLine);
            return {
              kind: "Assignment",
              target: {
                kind: "MemberAccess",
                target: { kind: "Identifier", name: "", loc: s.loc },
                member: assoc.member,
                loc: s.loc,
              },
              value: val,
              loc: s.loc,
            };
          });
          const withStmt: WithStatement = {
            kind: "WithStatement",
            expression: target,
            body: withBody,
            loc: s.loc,
          };
          return [assign, withStmt];
        }

        s.target = this.transformExpression(s.target, false, s.loc?.startLine);
        s.value = this.transformExpression(s.value, true, s.loc?.startLine);

        if (
          s.operator === "+=" ||
          s.operator === "-=" ||
          s.operator === "*=" ||
          s.operator === "/="
        ) {
          const op = s.operator.charAt(0);
          const target = s.target;
          s.operator = "=";
          s.value = {
            kind: "BinaryExpression",
            left: target,
            operator: op,
            right: s.value,
            loc: s.loc,
          };
        }

        if (this.isSugarEnabled("null-coalesce") && s.operator === "??=") {
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
        if (this.isSugarEnabled("logical-assignment") && s.operator === "||=") {
          const target = s.target;
          return {
            kind: "IfStatement",
            condition: { kind: "UnaryExpression", operator: "Not", argument: target, loc: s.loc },
            thenBranch: [{ kind: "Assignment", target, value: s.value, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }
        if (this.isSugarEnabled("logical-assignment") && s.operator === "&&=") {
          const target = s.target;
          return {
            kind: "IfStatement",
            condition: target,
            thenBranch: [{ kind: "Assignment", target, value: s.value, loc: s.loc }],
            elseIfBranches: [],
            loc: s.loc,
          };
        }

        if (this.isSugarEnabled("ternary") && s.value.kind === "TernaryExpression") {
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

        if (this.isSugarEnabled("null-coalesce") && s.value.kind === "NullCoalescingExpression") {
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

        if (
          this.isSugarEnabled("optional-chain") &&
          s.value.kind === "OptionalChainingExpression"
        ) {
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
        if (
          this.isSugarEnabled("object-initializer") &&
          s.value.kind === "ObjectInitializerExpression"
        ) {
          const objInit = s.value;
          const target = s.target;
          const creation: ObjectCreationExpression = {
            kind: "ObjectCreationExpression",
            type: objInit.type,
            arguments: objInit.arguments,
            loc: objInit.loc,
          };
          const baseAssign: Assignment = {
            kind: "Assignment",
            target,
            value: creation,
            loc: s.loc,
          };
          const assignments: Statement[] = objInit.assignments.map((assoc) => {
            const val = this.transformExpression(assoc.value, true, s.loc?.startLine);
            return {
              kind: "Assignment",
              target: {
                kind: "MemberAccess",
                target,
                member: assoc.member,
                loc: s.loc,
              },
              value: val,
              loc: s.loc,
            };
          });
          return [baseAssign, ...assignments];
        }

        return s;
      }

      case "EnumDeclaration": {
        if (!this.isSugarEnabled("enum")) return s;
        this.usedSugars.add("enum");
        const enumName = s.name;
        const entries = s.entries.map((entry) => {
          let valueStr = `"${entry.name}"`;
          if (entry.value) {
            if (entry.value.kind === "Literal") {
              const val = entry.value.value;
              if (typeof val === "string") valueStr = val;
              else if (val === null) valueStr = "NULL";
              else valueStr = String(val);
            } else if (entry.value.kind === "Identifier") {
              valueStr = entry.value.name;
            }
          }
          return { name: entry.name, value: valueStr };
        });

        const classMembers: ClassMember[] = [];

        classMembers.push({
          kind: "FieldDeclaration",
          name: "_Initialized",
          type: { kind: "TypeReference", name: "Boolean", typeArguments: [], loc: s.loc },
          modifiers: ["Private", "Shared"],
          loc: s.loc,
        });

        const initBody: Statement[] = [
          { kind: "OpaqueStatement", text: "If _Initialized Then Exit Sub", loc: s.loc },
        ];
        entries.forEach((entry, idx) => {
          initBody.push({
            kind: "OpaqueStatement",
            text: `CoreSugarBaseEnum._AddEnumItem("${enumName}", New ${enumName}(${idx}, ${entry.value}))`,
            loc: s.loc,
          });
        });
        initBody.push({ kind: "OpaqueStatement", text: "_Initialized = True", loc: s.loc });

        classMembers.push({
          kind: "MethodDeclaration",
          name: "Initialize",
          typeParameters: [],
          parameters: [],
          body: initBody,
          modifiers: ["Private", "Shared"],
          loc: s.loc,
        });

        for (const entry of entries) {
          classMembers.push({
            kind: "MethodDeclaration",
            name: entry.name,
            typeParameters: [],
            parameters: [],
            returnType: { kind: "TypeReference", name: enumName, typeArguments: [], loc: s.loc },
            body: [
              { kind: "OpaqueStatement", text: `${entry.name} = Load(${entry.value})`, loc: s.loc },
            ],
            modifiers: ["Shared"],
            loc: s.loc,
            noParentheses: true,
          });
        }

        classMembers.push({
          kind: "MethodDeclaration",
          name: "Load",
          typeParameters: [],
          parameters: [
            {
              kind: "ParameterDeclaration",
              name: "pValue",
              type: { kind: "TypeReference", name: "String", typeArguments: [], loc: s.loc },
            },
          ],
          returnType: { kind: "TypeReference", name: enumName, typeArguments: [], loc: s.loc },
          body: [
            { kind: "OpaqueStatement", text: `${enumName}.Initialize()`, loc: s.loc },
            {
              kind: "OpaqueStatement",
              text: `Load = CType(CoreSugarBaseEnum._GetCache("${enumName}", pValue), ${enumName})`,
              loc: s.loc,
            },
          ],
          modifiers: ["Shared"],
          loc: s.loc,
        });

        classMembers.push({
          kind: "MethodDeclaration",
          name: "GetOptions",
          typeParameters: [],
          parameters: [],
          returnType: { kind: "TypeReference", name: "String", typeArguments: [], loc: s.loc },
          body: [
            { kind: "OpaqueStatement", text: `${enumName}.Initialize()`, loc: s.loc },
            {
              kind: "OpaqueStatement",
              text: `GetOptions = CoreSugarBaseEnum._GetEnumOptions("${enumName}")`,
              loc: s.loc,
            },
          ],
          modifiers: ["Shared"],
          loc: s.loc,
        });

        const classDecl: ClassDeclaration = {
          kind: "ClassDeclaration",
          name: enumName,
          typeParameters: [],
          baseType: {
            kind: "TypeReference",
            name: "CoreSugarBaseEnum",
            typeArguments: [],
            loc: s.loc,
          },
          members: classMembers,
          modifiers: s.modifiers ?? [],
          loc: s.loc,
        };

        return classDecl as unknown as Statement;
      }

      case "DestructuredVariableDeclaration": {
        if (!this.isSugarEnabled(s.isObject ? "destructure-object" : "destructure-array")) return s;
        const sourceName =
          s.initializer.kind === "Identifier" ? s.initializer.name : this.freshSource();
        const declarations: Statement[] = [];

        if (s.initializer.kind !== "Identifier") {
          declarations.push({
            kind: "VariableDeclaration",
            name: sourceName,
            initializer: s.initializer,
            loc: s.loc,
          });
        }

        const sourceRef: Identifier = { kind: "Identifier", name: sourceName, loc: s.loc };

        if (s.isObject) {
          s.bindings.forEach((b) => {
            const memberName = b.property ?? b.name;
            const access: MemberAccess = {
              kind: "MemberAccess",
              target: sourceRef,
              member: memberName,
              loc: s.loc,
            };
            const decl: VariableDeclaration = {
              kind: "VariableDeclaration",
              name: b.name,
              initializer: access,
              loc: s.loc,
            };
            declarations.push(decl);
            if (b.defaultValue !== undefined) {
              const checkNull: BinaryExpression = {
                kind: "BinaryExpression",
                left: { kind: "Identifier", name: b.name, loc: s.loc },
                operator: "=",
                right: { kind: "Literal", value: null, loc: s.loc },
                loc: s.loc,
              };
              const checkEmpty: BinaryExpression = {
                kind: "BinaryExpression",
                left: { kind: "Identifier", name: b.name, loc: s.loc },
                operator: "=",
                right: { kind: "Literal", value: `""`, loc: s.loc },
                loc: s.loc,
              };
              const condition: BinaryExpression = {
                kind: "BinaryExpression",
                left: checkNull,
                operator: "Or",
                right: checkEmpty,
                loc: s.loc,
              };
              declarations.push({
                kind: "IfStatement",
                condition,
                thenBranch: [
                  {
                    kind: "Assignment",
                    target: { kind: "Identifier", name: b.name, loc: s.loc },
                    value: b.defaultValue,
                    loc: s.loc,
                  },
                ],
                elseIfBranches: [],
                loc: s.loc,
                singleLine: true,
              });
            }
          });
        } else {
          s.bindings.forEach((b, idx) => {
            if (b.isRest) {
              const restList = this.freshSource();
              const restListVar: Identifier = { kind: "Identifier", name: restList, loc: s.loc };
              declarations.push({
                kind: "VariableDeclaration",
                name: b.name,
                type: { kind: "TypeReference", name: "StringList", typeArguments: [], loc: s.loc },
                initializer: {
                  kind: "ObjectCreationExpression",
                  type: {
                    kind: "TypeReference",
                    name: "StringList",
                    typeArguments: [],
                    loc: s.loc,
                  },
                  arguments: [],
                  loc: s.loc,
                },
                loc: s.loc,
              });

              const countExpr: MemberAccess = {
                kind: "MemberAccess",
                target: sourceRef,
                member: "Count",
                loc: s.loc,
              };

              declarations.push({
                kind: "ForStatement",
                counter: restListVar,
                start: { kind: "Literal", value: idx, loc: s.loc },
                end: {
                  kind: "BinaryExpression",
                  left: countExpr,
                  operator: "-",
                  right: { kind: "Literal", value: 1, loc: s.loc },
                  loc: s.loc,
                },
                body: [
                  {
                    kind: "ExpressionStatement",
                    expression: {
                      kind: "MethodInvocation",
                      callee: { kind: "Identifier", name: b.name, loc: s.loc },
                      methodName: "Add",
                      typeArguments: [],
                      arguments: [
                        {
                          kind: "MethodInvocation",
                          callee: sourceRef,
                          methodName: "Item",
                          typeArguments: [],
                          arguments: [restListVar],
                          loc: s.loc,
                        },
                      ],
                      loc: s.loc,
                    },
                    loc: s.loc,
                  },
                ],
                loc: s.loc,
              });
            } else {
              const itemCall: MethodInvocation = {
                kind: "MethodInvocation",
                callee: sourceRef,
                methodName: "Item",
                typeArguments: [],
                arguments: [{ kind: "Literal", value: idx, loc: s.loc }],
                loc: s.loc,
              };
              declarations.push({
                kind: "VariableDeclaration",
                name: b.name,
                initializer: itemCall,
                loc: s.loc,
              });
            }
          });
        }

        return declarations;
      }

      case "ExpressionStatement": {
        const isCall = s.expression.kind === "OptionalChainingExpression";
        s.expression = this.transformExpression(s.expression, isCall, s.loc?.startLine);
        if (
          this.isSugarEnabled("optional-chain") &&
          s.expression.kind === "OptionalChainingExpression"
        ) {
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
        if (!this.isSugarEnabled("for-each") && !this.isSugarEnabled("for-each-range")) return s;
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

        statements.push({
          kind: "VariableDeclaration",
          name: idxVarName,
          type: {
            kind: "TypeReference",
            name: "Integer",
            typeArguments: [],
            loc: s.loc,
          },
          loc: s.loc,
        });

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
        if (!this.isSugarEnabled("using")) return s;
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
        if (!this.isSugarEnabled("match")) return s;
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
        if (this.isSugarEnabled("return-if") && s.expression?.kind === "TernaryExpression") {
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

      case "SelectCaseStatement": {
        s.expression = this.transformExpression(s.expression, false, s.loc?.startLine);
        for (const c of s.cases) {
          for (let i = 0; i < c.values.length; i++) {
            c.values[i] = this.transformExpression(c.values[i]!, false, c.loc?.startLine);
          }
          c.body = this.transformStatements(c.body);
        }
        return s;
      }

      case "Block": {
        s.statements = this.transformStatements(s.statements);
        return s;
      }

      case "OpaqueStatement":
        return s;
    }
    return s;
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

      case "ArrayAccessExpression":
        e.target = this.transformExpression(
          e.target,
          isAssignmentRhsOrCallStatementContext,
          startLine,
        );
        e.index = this.transformExpression(e.index, false, startLine);

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
        if (!this.isSugarEnabled("ternary") && !this.isSugarEnabled("return-if")) return e;
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
        if (!this.isSugarEnabled("null-coalesce")) return e;
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
        if (!this.isSugarEnabled("optional-chain")) return e;
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
        if (!this.isSugarEnabled("pipe")) return e;
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
        if (!this.isSugarEnabled(e.tag === "" ? "interpolation" : "tagged-template")) return e;
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
      case "ArrayLiteralExpression": {
        return e;
      }

      case "ArrowFunctionExpression": {
        return e;
      }

      case "ObjectInitializerExpression": {
        return {
          kind: "ObjectCreationExpression",
          type: e.type,
          arguments: e.arguments.map((arg) => this.transformExpression(arg, false, startLine)),
          loc: e.loc,
        };
      }
    }
    return e;
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
    if (expr.kind === "MethodInvocation") {
      const methodName = expr.methodName.toLowerCase();
      if (!expr.callee && (methodName === "cstr" || methodName === "char")) {
        return "String";
      }
      if (methodName === "tostring") {
        return "String";
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
    const sugarEngine = new SugarEngine(ctx.sugarOptions);
    const eol = code.includes("\r\n") ? "\r\n" : "\n";
    let lines = code.split(/\r?\n/);

    // 1. Pre-process lines with text pre-passes
    if (sugarEngine.isEnabled("numeric-separator")) {
      lines = lines.map((line) => NUMERIC_SEPARATOR_TRANSFORM.apply(line));
    }
    lines = lines.map(normalizeMetaProgrammingSyntax);
    const processedCode = lines.join(eol);

    // 2. Parse to AST (Check if has structural definitions first)
    const plugins = [...sugarEngine.createParserPlugins(), new GenericsParserPlugin()];
    const tempParse = parseBasic(processedCode, { plugins });
    const hasStructural = tempParse.unit.members.some(
      (m) =>
        m.kind === "NamespaceDeclaration" ||
        m.kind === "ClassDeclaration" ||
        m.kind === "MethodDeclaration" ||
        m.kind === "DelegateDeclaration" ||
        m.kind === "EnumDeclaration",
    );

    let finalUnit = tempParse.unit;
    let transformerLines = lines;
    let wrapped = false;

    if (!hasStructural) {
      wrapped = true;
      const wrappedCode = `Sub __syntheticMethod()${eol}${processedCode}${eol}End Sub`;
      finalUnit = parseBasic(wrappedCode, { plugins }).unit;
      transformerLines = [`Sub __syntheticMethod()`, ...lines, `End Sub`];
    }

    // 3. Run generics monomorphizer directly on the AST
    const monomorphizer = new GenericsMonomorphizer({
      isTypeDescendantOf: ctx.isTypeDescendantOf?.bind(ctx),
      externalTemplates: ctx.externalGenericTemplates,
      requestedInstantiations: ctx.requestedGenericInstantiations,
    });
    const genericsResult = monomorphizer.monomorphize(finalUnit);
    injectImportsForMaterializedGenericInstantiations(finalUnit, ctx);

    // 4. Transform AST-to-AST for sugars
    const transformer = new ASTSugarTransformer(ctx, transformerLines, sugarEngine);
    if (sugarEngine.anyEnabled()) {
      transformer.walk(finalUnit);
    }

    // 5. Serialize AST back to code text, generating the lineMap!
    let serializeResult = serializeUnitWithMap(finalUnit, { eol, omitPublicFieldModifiers: true });

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
      usedSugars: transformer.usedSugars,
    };
  }
}
