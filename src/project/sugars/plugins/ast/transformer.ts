import { parseInterpolation } from "../../../../utils/interpolation";
import { inferLiteralType } from "../../../../utils/literal-type-infer";
import { SugarRegistry } from "../..";
import type { SugarEngine } from "../..";
import { parseExpr } from "../../../parser";
import { ArrayListSugarTransformer } from "../array-list/transformer";
import { expandDestructuredVariableDeclaration } from "../destructure/transformer";
import { expandEnumDeclaration } from "../enum/transformer";
import { expandInlineIf } from "../inline-if/transformer";
import type {
  Statement,
  Expression,
  VariableDeclaration,
  ExpressionStatement,
  Identifier,
  MemberAccess,
  MethodInvocation,
  TypeReference,
  TopLevelMember,
  Node,
  ObjectCreationExpression,
  Assignment,
  WithStatement,
  IfStatement,
  ThrowStatement,
  CompilationUnit,
  ClassDeclaration,
  MethodDeclaration,
} from "../../../ast/ast";
import type { SugarDiagnostic, TranspileContext } from "../../../transpiler-types";

interface TypeScope {
  readonly values: Map<string, string>;
  readonly methods: Map<string, string>;
}

class AstTypeCatalog {
  private readonly globals: TypeScope = { values: new Map(), methods: new Map() };
  private readonly classes = new Map<string, TypeScope>();
  private readonly methodLocals = new WeakMap<MethodDeclaration, Map<string, string>>();

  constructor(
    unit: CompilationUnit,
    private readonly ctx: TranspileContext,
  ) {
    this.collectMembers(unit.members);
  }

  public resolve(
    expr: Expression,
    activeClass: ClassDeclaration | undefined,
    activeMethod: MethodDeclaration | undefined,
  ): string | undefined {
    switch (expr.kind) {
      case "Literal":
        return expr.value === null ? "Variant" : inferLiteralType(String(expr.value));
      case "ObjectCreationExpression":
        return expr.type.name;
      case "BinaryExpression":
        return expr.operator === "&" ? "String" : undefined;
      case "Identifier":
        return this.resolveIdentifier(expr.name, activeClass, activeMethod);
      case "MemberAccess": {
        const targetType = this.resolve(expr.target, activeClass, activeMethod);
        return targetType ? this.resolveMember(targetType, expr.member, 0) : undefined;
      }
      case "MethodInvocation": {
        if (expr.callee) {
          const targetType = this.resolve(expr.callee, activeClass, activeMethod);
          return targetType
            ? this.resolveMember(targetType, expr.methodName, expr.arguments.length)
            : undefined;
        }
        return (
          this.classScope(activeClass)?.methods.get(expr.methodName.toLowerCase()) ??
          this.globals.methods.get(expr.methodName.toLowerCase()) ??
          this.ctx.resolveGlobalSymbolType?.(expr.methodName, expr.arguments.length)
        );
      }
      default:
        return undefined;
    }
  }

  private collectMembers(members: readonly TopLevelMember[]): void {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        this.collectMembers(member.members);
      } else if (member.kind === "ClassDeclaration") {
        const scope: TypeScope = { values: new Map(), methods: new Map() };
        this.classes.set(member.name.toLowerCase(), scope);
        for (const classMember of member.members) {
          if (
            classMember.kind === "FieldDeclaration" ||
            classMember.kind === "PropertyDeclaration"
          ) {
            scope.values.set(classMember.name.toLowerCase(), classMember.type.name);
          } else if (classMember.kind === "MethodDeclaration" && classMember.returnType) {
            scope.methods.set(classMember.name.toLowerCase(), classMember.returnType.name);
          }
          if (classMember.kind === "MethodDeclaration") {
            this.collectMethodLocals(classMember);
          }
        }
      } else if (member.kind === "MethodDeclaration") {
        if (member.returnType) {
          this.globals.methods.set(member.name.toLowerCase(), member.returnType.name);
        }
        this.collectMethodLocals(member);
      } else if (member.kind === "VariableDeclaration" && member.type) {
        this.globals.values.set(member.name.toLowerCase(), member.type.name);
      }
    }
  }

  private collectMethodLocals(method: MethodDeclaration): void {
    const locals = new Map<string, string>();
    for (const parameter of method.parameters) {
      locals.set(parameter.name.toLowerCase(), parameter.type.name);
    }
    const collectStatements = (statements: readonly Statement[]): void => {
      for (const statement of statements) {
        if (statement.kind === "VariableDeclaration" && statement.type) {
          locals.set(statement.name.toLowerCase(), statement.type.name);
        } else if (statement.kind === "ForEachStatement" && statement.elementType) {
          locals.set(statement.elementVar.name.toLowerCase(), statement.elementType.name);
          collectStatements(statement.body);
        } else if (statement.kind === "ForStatement") {
          locals.set(statement.counter.name.toLowerCase(), "Integer");
          collectStatements(statement.body);
        } else if (statement.kind === "IfStatement") {
          collectStatements(statement.thenBranch);
          for (const branch of statement.elseIfBranches) collectStatements(branch.body);
          if (statement.elseBranch) collectStatements(statement.elseBranch);
        } else if (statement.kind === "WhileStatement" || statement.kind === "WithStatement") {
          collectStatements(statement.body);
        } else if (statement.kind === "TryCatchStatement") {
          if (statement.catchVar && statement.catchType) {
            locals.set(statement.catchVar.name.toLowerCase(), statement.catchType.name);
          }
          collectStatements(statement.tryBody);
          collectStatements(statement.catchBody);
          if (statement.finallyBody) collectStatements(statement.finallyBody);
        } else if (statement.kind === "UsingStatement") {
          locals.set(statement.resourceVar.name.toLowerCase(), statement.resourceType.name);
          collectStatements(statement.body);
        } else if (statement.kind === "Block") {
          collectStatements(statement.statements);
        }
      }
    };
    collectStatements(method.body);
    this.methodLocals.set(method, locals);
  }

  private resolveIdentifier(
    name: string,
    activeClass: ClassDeclaration | undefined,
    activeMethod: MethodDeclaration | undefined,
  ): string | undefined {
    const lower = name.toLowerCase();
    if (lower === "me") return activeClass?.name;
    if (activeMethod) {
      const localType = this.methodLocals.get(activeMethod)?.get(lower);
      if (localType) return localType;
    }
    return this.classScope(activeClass)?.values.get(lower) ?? this.globals.values.get(lower);
  }

  private resolveMember(typeName: string, name: string, argumentCount: number): string | undefined {
    return (
      this.classes.get(typeName.toLowerCase())?.values.get(name.toLowerCase()) ??
      this.classes.get(typeName.toLowerCase())?.methods.get(name.toLowerCase()) ??
      this.ctx.resolveMemberType?.(typeName, name, argumentCount)
    );
  }

  private classScope(activeClass: ClassDeclaration | undefined): TypeScope | undefined {
    return activeClass ? this.classes.get(activeClass.name.toLowerCase()) : undefined;
  }
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

export class ASTSugarTransformer extends ArrayListSugarTransformer {
  public diagnostics: SugarDiagnostic[] = [];
  public readonly usedSugars = new Set<string>();
  private srcCounter = 0;
  private idxCounter = 0;
  private typeCatalog: AstTypeCatalog | undefined;
  private activeClass: ClassDeclaration | undefined;
  private activeMethod: MethodDeclaration | undefined;

  constructor(
    private readonly ctx: TranspileContext,
    private readonly sugarEngine: SugarEngine,
  ) {
    super();
  }

  protected isSugarEnabled(id: string): boolean {
    return this.sugarEngine.isEnabled(id);
  }

  protected freshIndex(): string {
    return `__idx${this.idxCounter++}`;
  }

  protected freshSource(): string {
    return `__src${this.srcCounter++}`;
  }

  override walk(node: Node): void {
    if (node.kind === "CompilationUnit") {
      this.typeCatalog = new AstTypeCatalog(node, this.ctx);
      node.members = this.transformMembers(node.members);

      // Auto-inject imports for utility modules and core module dependencies.
      const imports = new Set([
        ...SugarRegistry.getUtilityModules(this.usedSugars).map((utility) => utility.namespace),
        ...SugarRegistry.getRequiredImports(this.usedSugars),
      ]);
      for (const target of imports) {
        if (target) {
          const hasImport = node.members.some(
            (m) =>
              m.kind === "ImportsDeclaration" && m.target.toLowerCase() === target.toLowerCase(),
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
              target,
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
      const previousClass = this.activeClass;
      this.activeClass = node;
      try {
        for (const m of node.members) {
          this.walk(m);
        }
      } finally {
        this.activeClass = previousClass;
      }
      return;
    }
    if (node.kind === "MethodDeclaration") {
      const previousMethod = this.activeMethod;
      this.activeMethod = node;
      this.listVariableScopes.push(this.createListScope());
      try {
        node.body = this.transformStatements(node.body);
      } finally {
        this.listVariableScopes.pop();
        this.activeMethod = previousMethod;
      }
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

  protected transformStatements(stmts: Statement[]): Statement[] {
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
        if (s.type && this.isTTListType(s.type)) {
          this.rememberListVariable(s.name, s.type);
        }

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
          const functionalExpansion = this.expandFunctionalListDeclaration(s);
          if (functionalExpansion) return functionalExpansion;
          if (
            this.isSugarEnabled("array-list") &&
            this.isTTListType(s.type) &&
            s.initializer.kind === "ArrayLiteralExpression"
          ) {
            this.usedSugars.add("array-list");
            return this.expandArrayLiteralDeclaration(s, s.initializer);
          }
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

        if (
          this.isSugarEnabled("array-list") &&
          s.target.kind === "ArrayAccessExpression" &&
          this.isListExpression(s.target.target)
        ) {
          this.usedSugars.add("array-list");
          return {
            kind: "ExpressionStatement",
            expression: {
              kind: "MethodInvocation",
              callee: this.transformExpression(s.target.target, false, s.loc?.startLine),
              methodName: "SetItem",
              typeArguments: [],
              arguments: [
                this.transformExpression(s.target.index, false, s.loc?.startLine),
                this.transformExpression(s.value, false, s.loc?.startLine),
              ],
              loc: s.loc,
            },
            loc: s.loc,
            comment: s.comment,
          };
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
        return expandEnumDeclaration(s);
      }

      case "DestructuredVariableDeclaration": {
        if (!this.isSugarEnabled(s.isObject ? "destructure-object" : "destructure-array")) return s;
        return expandDestructuredVariableDeclaration(s, { freshSource: () => this.freshSource() });
      }

      case "ExpressionStatement": {
        const isCall = s.expression.kind === "OptionalChainingExpression";
        s.expression = this.transformExpression(s.expression, isCall, s.loc?.startLine);
        const forEachExpansion = this.expandFunctionalForEachStatement(s);
        if (forEachExpansion) return forEachExpansion;
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
        if (this.isSugarEnabled("inline-if") && s.singleLine) {
          this.usedSugars.add("inline-if");
          s = expandInlineIf(s);
        }
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
          loc: s.loc,
        };

        const instantiate: Assignment = {
          kind: "Assignment",
          target: s.resourceVar,
          value: {
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

        const catchVar: Identifier = {
          kind: "Identifier",
          name: "ex",
          loc: s.loc,
        };

        const catchType: TypeReference = {
          kind: "TypeReference",
          name: "Exception",
          typeArguments: [],
          loc: s.loc,
        };

        const assignedCheck: MethodInvocation = {
          kind: "MethodInvocation",
          methodName: "Assigned",
          typeArguments: [],
          arguments: [s.resourceVar],
          loc: s.loc,
        };

        const freeCallInCatch: ExpressionStatement = {
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

        const ifAssigned: IfStatement = {
          kind: "IfStatement",
          condition: assignedCheck,
          thenBranch: [freeCallInCatch],
          elseIfBranches: [],
          loc: s.loc,
        };

        const throwStmt: ThrowStatement = {
          kind: "ThrowStatement",
          expression: {
            kind: "Identifier",
            name: "ex",
            loc: s.loc,
          },
          loc: s.loc,
        };

        return [
          resourceDecl,
          {
            kind: "TryCatchStatement",
            tryBody: [instantiate, ...s.body, freeCall],
            catchVar,
            catchType,
            catchBody: [ifAssigned, throwStmt],
            loc: s.loc,
          },
        ];
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

  protected transformExpression(
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

        if (this.isSugarEnabled("array-list") && this.isListExpression(e.target)) {
          this.usedSugars.add("array-list");
          return {
            kind: "MethodInvocation",
            callee: e.target,
            methodName: "GetItem",
            typeArguments: [],
            arguments: [e.index],
            loc: e.loc,
          };
        }

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
        e.elements = e.elements.map((element) => {
          if (element.kind === "SpreadExpression") {
            element.expression = this.transformExpression(element.expression, false, startLine);
            return element;
          }
          return this.transformExpression(element, false, startLine);
        });
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
    const astType = this.typeCatalog?.resolve(expr, this.activeClass, this.activeMethod);
    if (astType) return astType;
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
