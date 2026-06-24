import * as vscode from "vscode";
import type { SymbolInfo } from "./symbol-indexer";
import type { WorkspaceSymbolIndexer } from "./symbol-indexer";
import { TypeResolver } from "./type-resolver";
import type { Token } from "../project/parser";
import { LanguageProcessor } from "./language-processor";
import type {
  ClassDeclaration,
  ClassMember,
  CompilationUnit,
  Expression,
  ForEachStatement,
  MethodDeclaration,
  NamespaceDeclaration,
  ParameterDeclaration,
  PropertyDeclaration,
  Statement,
  TopLevelMember,
  TypeReference,
  VariableDeclaration,
} from "../project/ast/ast";

export interface AstLocalBinding {
  name: string;
  type: string;
  isConst: boolean;
  range: vscode.Range;
  description: string;
  scope: AstBindingScope;
}

export type AstBindingScope = "top-level" | "routine" | "block";

export interface AstMemberAccessContext {
  memberName: string;
  receiver?: Expression;
  receiverType?: string;
  symbol?: SymbolInfo;
}

export interface ImportsCompletionContext {
  prefix: string;
}

interface MemberCandidate {
  memberName: string;
  receiver?: Expression;
  arity?: number;
}

export class D7AstContext {
  public readonly unit: CompilationUnit;
  public readonly tokens: readonly Token[];
  public readonly tokenAtPosition: Token | undefined;
  public readonly wordRange: vscode.Range | undefined;

  private localsCache: AstLocalBinding[] | undefined;
  private genericParamsCache: Map<string, string> | undefined;

  public constructor(
    public readonly document: vscode.TextDocument,
    public readonly position: vscode.Position,
    private readonly indexer: WorkspaceSymbolIndexer,
  ) {
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    this.unit = cached.unit;
    this.tokens = cached.tokens;
    this.tokenAtPosition = this.findTokenAtPosition(position);
    this.wordRange = this.tokenAtPosition ? tokenRange(this.tokenAtPosition) : undefined;
  }

  public get word(): string | undefined {
    return this.tokenAtPosition?.value;
  }

  public getImportsCompletionContext(): ImportsCompletionContext | undefined {
    const line = this.position.line + 1;
    const before = this.tokens.filter(
      (t) =>
        t.loc.line === line &&
        t.kind !== "newline" &&
        t.kind !== "eof" &&
        tokenEndColumn(t) <= this.position.character,
    );
    const first = before[0];
    if (first?.value.toLowerCase() !== "imports") return undefined;
    if (this.position.character <= tokenEndColumn(first)) return undefined;

    const rest = before.slice(1);
    const valid = rest.every(
      (t) => t.kind === "identifier" || (t.kind === "punct" && t.value === "."),
    );
    if (!valid) return undefined;

    return { prefix: rest.map((t) => t.value).join("") };
  }

  public getActiveClassSymbol(): SymbolInfo | undefined {
    const fileSyms = this.indexer.getFileSymbols(this.document.uri.toString());
    return fileSyms?.symbols.find(
      (s) =>
        s.kind === "class" &&
        this.position.line >= s.range.startLine &&
        this.position.line <= s.range.endLine,
    );
  }

  public getActiveMethodSymbol(): SymbolInfo | undefined {
    const fileSyms = this.indexer.getFileSymbols(this.document.uri.toString());
    return fileSyms?.symbols.find(
      (s) =>
        (s.kind === "method" || s.kind === "declare_sub" || s.kind === "declare_function") &&
        this.position.line >= s.range.startLine &&
        this.position.line <= s.range.endLine,
    );
  }

  public getActivePropertySymbol(): SymbolInfo | undefined {
    const fileSyms = this.indexer.getFileSymbols(this.document.uri.toString());
    return fileSyms?.symbols.find(
      (s) =>
        (s.kind === "property" || s.kind === "indexed-property") &&
        this.position.line >= s.range.startLine &&
        this.position.line <= s.range.endLine,
    );
  }

  public getVisibleLocals(): AstLocalBinding[] {
    if (this.localsCache) return this.localsCache;

    const locals: AstLocalBinding[] = [];
    const activeMethod = this.getActiveMethodSymbol();
    const activeProperty = this.getActivePropertySymbol();
    const methodDecl = activeMethod ? this.findMethodDeclaration(activeMethod) : undefined;
    const propertyDecl = activeProperty ? this.findPropertyDeclaration(activeProperty) : undefined;

    this.collectStatementBindings(
      collectTopLevelStatements(this.unit.members),
      locals,
      "top-level",
    );

    if (methodDecl) {
      addParameters(
        locals,
        methodDecl.parameters,
        `Parametro de \`${methodDecl.name}\``,
        "routine",
      );
      this.collectStatementBindings(methodDecl.body, locals, "routine");
    }

    if (propertyDecl) {
      if (activeProperty?.parameters) {
        for (const param of activeProperty.parameters) {
          locals.push({
            name: param.name,
            type: param.type,
            isConst: false,
            range: symbolRange(activeProperty),
            description: `Parametro de \`${activeProperty.name}\``,
            scope: "routine",
          });
        }
      }

      if (propertyDecl.getter && isBeforeOrAt(propertyDecl.getter.loc, this.position)) {
        this.collectStatementBindings(propertyDecl.getter.body, locals, "routine");
      }
      if (propertyDecl.setter && isBeforeOrAt(propertyDecl.setter.loc, this.position)) {
        addParameters(
          locals,
          propertyDecl.setter.parameters,
          "Parametro de atribuicao do bloco `Set`",
          "routine",
        );
        this.collectStatementBindings(propertyDecl.setter.body, locals, "routine");
      }
    }

    this.localsCache = dedupeLocals(locals);
    return this.localsCache;
  }

  public findLocal(name: string): AstLocalBinding | undefined {
    const lower = name.toLowerCase();
    return this.getVisibleLocals().find((l) => l.name.toLowerCase() === lower);
  }

  public getGenericParametersInScope(): Map<string, string> {
    if (this.genericParamsCache) return this.genericParamsCache;

    const params = new Map<string, string>();
    const activeMethod = this.getActiveMethodSymbol();
    const activeClass = this.getActiveClassSymbol();
    const methodDecl = activeMethod ? this.findMethodDeclaration(activeMethod) : undefined;
    const classDecl = activeClass ? this.findClassDeclaration(activeClass) : undefined;

    if (methodDecl) {
      for (const tp of methodDecl.typeParameters) {
        params.set(tp.name.toLowerCase(), typeRefToString(tp.constraint) ?? tp.name);
      }
    }
    if (classDecl) {
      for (const tp of classDecl.typeParameters) {
        const lower = tp.name.toLowerCase();
        if (!params.has(lower)) {
          params.set(lower, typeRefToString(tp.constraint) ?? tp.name);
        }
      }
    }

    this.genericParamsCache = params;
    return params;
  }

  public getMemberAccessContext(): AstMemberAccessContext | undefined {
    const candidate = this.findMemberCandidateAtPosition();
    if (!candidate) return undefined;

    let receiverType: string | undefined;
    if (candidate.receiver) {
      receiverType = this.resolveExpressionType(candidate.receiver);
    }

    const symbol =
      receiverType !== undefined
        ? TypeResolver.findMember(receiverType, candidate.memberName, this.indexer, candidate.arity)
        : undefined;

    return {
      memberName: candidate.memberName,
      receiver: candidate.receiver,
      receiverType,
      symbol,
    };
  }

  public getForEachAtPosition(): ForEachStatement | undefined {
    const statements = this.getAllStatements();
    return statements.find(
      (s): s is ForEachStatement =>
        s.kind === "ForEachStatement" && locLine(s.loc) === this.position.line,
    );
  }

  public resolveExpressionType(expr: Expression): string | undefined {
    const lineIdx = Math.max(0, (expr.loc?.startLine ?? this.position.line + 1) - 1);
    return TypeResolver.resolveExpressionType(expr, this.document, lineIdx, this.indexer);
  }

  public expressionToText(expr: Expression): string {
    switch (expr.kind) {
      case "Identifier":
        return expr.name;
      case "Literal":
        return expr.value === null ? "Nothing" : String(expr.value);
      case "TaggedTemplateExpression":
        return `$"${expr.body}"`;
      case "ObjectCreationExpression":
        return `New ${typeRefToString(expr.type) ?? ""}(...)`;
      case "MemberAccess":
        return `${this.expressionToText(expr.target)}.${expr.member}`;
      case "MethodInvocation": {
        const prefix = expr.callee ? `${this.expressionToText(expr.callee)}.` : "";
        return `${prefix}${expr.methodName}(...)`;
      }
      case "OptionalChainingExpression":
        return `${this.expressionToText(expr.target)}?.${this.expressionToText(expr.member)}`;
      case "BinaryExpression":
        return `${this.expressionToText(expr.left)} ${expr.operator} ${this.expressionToText(expr.right)}`;
      case "UnaryExpression":
        return `${expr.operator} ${this.expressionToText(expr.argument)}`;
      case "TernaryExpression":
        return `${this.expressionToText(expr.condition)} ? ${this.expressionToText(expr.trueExpr)} : ${this.expressionToText(expr.falseExpr)}`;
      case "NullCoalescingExpression":
        return `${this.expressionToText(expr.left)} ?? ${this.expressionToText(expr.right)}`;
      case "PipeExpression":
        return `${this.expressionToText(expr.left)} |> ${this.expressionToText(expr.right)}`;
    }
    return "";
  }

  private findMemberCandidateAtPosition(): MemberCandidate | undefined {
    const memberName = this.currentMemberFragment();
    if (memberName === undefined) return undefined;

    const statement = this.findStatementAtLine(this.position.line);
    if (!statement) return undefined;

    const candidates: MemberCandidate[] = [];
    walkStatementExpressions(statement, (expr) => {
      if (expr.kind === "MemberAccess") {
        candidates.push({ memberName: expr.member, receiver: expr.target, arity: 0 });
      } else if (expr.kind === "MethodInvocation" && expr.callee) {
        candidates.push({
          memberName: expr.methodName,
          receiver: expr.callee,
          arity: expr.arguments.length,
        });
      } else if (expr.kind === "OptionalChainingExpression") {
        if (expr.member.kind === "MemberAccess") {
          candidates.push({ memberName: expr.member.member, receiver: expr.target, arity: 0 });
        } else if (expr.member.kind === "MethodInvocation") {
          candidates.push({
            memberName: expr.member.methodName,
            receiver: expr.target,
            arity: expr.member.arguments.length,
          });
        }
      }
    });

    const lower = memberName.toLowerCase();
    return (
      candidates.reverse().find((c) => c.memberName.toLowerCase() === lower) ??
      candidates.find((c) => memberName.length === 0 && c.memberName.length === 0)
    );
  }

  private currentMemberFragment(): string | undefined {
    const line = this.position.line + 1;
    const significant = this.tokens.filter(
      (t) =>
        t.loc.line === line &&
        t.kind !== "newline" &&
        t.kind !== "eof" &&
        t.loc.column <= this.position.character,
    );

    if (this.tokenAtPosition) {
      const idx = significant.findIndex((t) => t === this.tokenAtPosition);
      if (
        idx > 0 &&
        significant[idx - 1]?.kind === "punct" &&
        significant[idx - 1]?.value === "."
      ) {
        return this.tokenAtPosition.value;
      }
      return undefined;
    }

    const last = significant[significant.length - 1];
    if (last?.kind === "punct" && last.value === ".") return "";
    return undefined;
  }

  private findTokenAtPosition(position: vscode.Position): Token | undefined {
    const line = position.line + 1;
    return this.tokens.find((t) => {
      if (t.loc.line !== line) return false;
      if (t.kind === "newline" || t.kind === "eof" || t.kind === "punct") return false;
      return position.character >= t.loc.column && position.character <= tokenEndColumn(t);
    });
  }

  private findClassDeclaration(symbol: SymbolInfo): ClassDeclaration | undefined {
    let found: ClassDeclaration | undefined;
    walkTopLevel(this.unit.members, (member) => {
      if (
        member.kind === "ClassDeclaration" &&
        member.name.toLowerCase() === symbol.name.toLowerCase() &&
        locLine(member.loc) === symbol.range.startLine
      ) {
        found = member;
      }
    });
    return found;
  }

  private findMethodDeclaration(symbol: SymbolInfo): MethodDeclaration | undefined {
    let found: MethodDeclaration | undefined;
    walkTopLevel(this.unit.members, (member) => {
      if (
        member.kind === "MethodDeclaration" &&
        member.name.toLowerCase() === symbol.name.toLowerCase() &&
        locLine(member.loc) === symbol.range.startLine
      ) {
        found = member;
        return;
      }
      if (member.kind !== "ClassDeclaration" && member.kind !== "NamespaceDeclaration") return;
      for (const method of collectMethods(member)) {
        if (
          method.name.toLowerCase() === symbol.name.toLowerCase() &&
          locLine(method.loc) === symbol.range.startLine
        ) {
          found = method;
          return;
        }
      }
    });
    return found;
  }

  private findPropertyDeclaration(symbol: SymbolInfo): PropertyDeclaration | undefined {
    let found: PropertyDeclaration | undefined;
    walkTopLevel(this.unit.members, (member) => {
      if (member.kind !== "ClassDeclaration" && member.kind !== "NamespaceDeclaration") return;
      for (const prop of collectProperties(member)) {
        if (
          prop.name.toLowerCase() === symbol.name.toLowerCase() &&
          locLine(prop.loc) === symbol.range.startLine
        ) {
          found = prop;
          return;
        }
      }
    });
    return found;
  }

  private collectStatementBindings(
    statements: readonly Statement[],
    out: AstLocalBinding[],
    rootScope: Exclude<AstBindingScope, "block">,
    depth = 0,
  ): void {
    for (const statement of statements) {
      if (!isBeforeOrAt(statement.loc, this.position)) continue;
      const lexicalScope: AstBindingScope =
        rootScope === "top-level" ? "top-level" : depth === 0 ? "routine" : "block";
      switch (statement.kind) {
        case "VariableDeclaration":
          out.push(this.bindingFromVariable(statement, lexicalScope));
          break;
        case "DestructuredVariableDeclaration":
          for (const b of statement.bindings) {
            out.push({
              name: b.name,
              type: "Variant",
              isConst: false,
              range: tokenRangeFromLoc(statement.loc, b.name.length),
              description: "Variavel local (desestruturada)",
              scope: lexicalScope,
            });
          }
          break;
        case "ForEachStatement":
          out.push({
            name: statement.elementVar.name,
            type: typeRefToString(statement.elementType) ?? "Variant",
            isConst: false,
            range: tokenRangeFromLoc(statement.elementVar.loc, statement.elementVar.name.length),
            description: "Variavel local do `For Each`",
            scope: "block",
          });
          this.collectStatementBindings(statement.body, out, rootScope, depth + 1);
          break;
        case "ForStatement":
          out.push({
            name: statement.counter.name,
            type: "Integer",
            isConst: false,
            range: tokenRangeFromLoc(statement.counter.loc, statement.counter.name.length),
            description: "Variavel local do `For`",
            scope: "block",
          });
          this.collectStatementBindings(statement.body, out, rootScope, depth + 1);
          break;
        case "IfStatement":
          this.collectStatementBindings(statement.thenBranch, out, rootScope, depth + 1);
          for (const branch of statement.elseIfBranches) {
            this.collectStatementBindings(branch.body, out, rootScope, depth + 1);
          }
          if (statement.elseBranch) {
            this.collectStatementBindings(statement.elseBranch, out, rootScope, depth + 1);
          }
          break;
        case "WhileStatement":
          this.collectStatementBindings(statement.body, out, rootScope, depth + 1);
          break;
        case "TryCatchStatement":
          this.collectStatementBindings(statement.tryBody, out, rootScope, depth + 1);
          if (statement.catchVar && isBeforeOrAt(statement.catchVar.loc, this.position)) {
            out.push({
              name: statement.catchVar.name,
              type: typeRefToString(statement.catchType) ?? "Exception",
              isConst: false,
              range: tokenRangeFromLoc(statement.catchVar.loc, statement.catchVar.name.length),
              description: "Parametro do bloco `Catch`",
              scope: "block",
            });
          }
          this.collectStatementBindings(statement.catchBody, out, rootScope, depth + 1);
          if (statement.finallyBody) {
            this.collectStatementBindings(statement.finallyBody, out, rootScope, depth + 1);
          }
          break;
        case "UsingStatement":
          out.push({
            name: statement.resourceVar.name,
            type: typeRefToString(statement.resourceType) ?? "Variant",
            isConst: false,
            range: tokenRangeFromLoc(statement.resourceVar.loc, statement.resourceVar.name.length),
            description: "Variavel local do `Using`",
            scope: "block",
          });
          this.collectStatementBindings(statement.body, out, rootScope, depth + 1);
          break;
        case "WithStatement":
          this.collectStatementBindings(statement.body, out, rootScope, depth + 1);
          break;
        case "MatchStatement":
          for (const matchCase of statement.cases) {
            this.collectStatementBindings(matchCase.body, out, rootScope, depth + 1);
          }
          break;
        case "Block":
          this.collectStatementBindings(statement.statements, out, rootScope, depth + 1);
          break;
        case "Assignment":
        case "ExpressionStatement":
        case "OpaqueStatement":
        case "ReturnStatement":
          break;
      }
    }
  }

  private bindingFromVariable(node: VariableDeclaration, scope: AstBindingScope): AstLocalBinding {
    const explicitType = typeRefToString(node.type);
    const inferredType =
      !explicitType && node.initializer ? this.resolveExpressionType(node.initializer) : undefined;
    return {
      name: node.name,
      type: explicitType ?? inferredType ?? "Variant",
      isConst: node.isConst ?? false,
      range: tokenRangeFromLoc(node.loc, node.name.length),
      description: node.isConst ? "Constante local" : "Variavel local",
      scope,
    };
  }

  private getAllStatements(): Statement[] {
    const statements: Statement[] = [];
    collectStatements(collectTopLevelStatements(this.unit.members), statements);
    walkTopLevel(this.unit.members, (member) => {
      if (member.kind === "MethodDeclaration") {
        collectStatements(member.body, statements);
      } else if (member.kind === "PropertyDeclaration") {
        if (member.getter) {
          collectStatements(member.getter.body, statements);
        }
        if (member.setter) {
          collectStatements(member.setter.body, statements);
        }
      }
    });
    return statements;
  }

  private findStatementAtLine(line: number): Statement | undefined {
    const candidates = this.getAllStatements().filter((s) => locLine(s.loc) === line);
    return candidates[candidates.length - 1];
  }
}

export function astLocalToSymbol(
  local: AstLocalBinding,
  document: vscode.TextDocument,
): SymbolInfo {
  return {
    name: local.name,
    kind: "variable",
    type: local.type,
    isShared: false,
    isPrivate: false,
    isConst: local.isConst,
    fileUri: document.uri.toString(),
    range: {
      startLine: local.range.start.line,
      startChar: local.range.start.character,
      endLine: local.range.end.line,
      endChar: local.range.end.character,
    },
    description: local.description,
  };
}

export function typeRefToString(typeRef: TypeReference | undefined): string | undefined {
  if (!typeRef?.name) return undefined;
  if (typeRef.typeArguments.length === 0) return typeRef.name;
  return `${typeRef.name}<${typeRef.typeArguments
    .map((arg) => typeRefToString(arg) ?? "")
    .join(", ")}>`;
}

function addParameters(
  out: AstLocalBinding[],
  params: readonly ParameterDeclaration[],
  description: string,
  scope: AstBindingScope,
): void {
  for (const param of params) {
    out.push({
      name: param.name,
      type: typeRefToString(param.type) ?? "Variant",
      isConst: false,
      range: tokenRangeFromLoc(param.loc, param.name.length),
      description,
      scope,
    });
  }
}

function walkTopLevel(
  members: readonly TopLevelMember[],
  visit: (member: TopLevelMember | ClassMember | NamespaceDeclaration | MethodDeclaration) => void,
): void {
  for (const member of members) {
    visit(member);
    if (member.kind === "NamespaceDeclaration") {
      walkTopLevel(member.members, visit);
    } else if (member.kind === "ClassDeclaration") {
      walkClass(member, visit);
    }
  }
}

function walkClass(
  klass: ClassDeclaration,
  visit: (member: TopLevelMember | ClassMember | NamespaceDeclaration | MethodDeclaration) => void,
): void {
  for (const classMember of klass.members) {
    visit(classMember);
    if (classMember.kind === "ClassDeclaration") {
      walkClass(classMember, visit);
    }
  }
}

function collectMethods(member: ClassDeclaration | NamespaceDeclaration): MethodDeclaration[] {
  const result: MethodDeclaration[] = [];
  const members = member.kind === "ClassDeclaration" ? member.members : member.members;
  for (const child of members) {
    if (child.kind === "MethodDeclaration") result.push(child);
    if (child.kind === "ClassDeclaration" || child.kind === "NamespaceDeclaration") {
      result.push(...collectMethods(child));
    }
  }
  return result;
}

function collectProperties(member: ClassDeclaration | NamespaceDeclaration): PropertyDeclaration[] {
  const result: PropertyDeclaration[] = [];
  const members = member.kind === "ClassDeclaration" ? member.members : member.members;
  for (const child of members) {
    if (child.kind === "PropertyDeclaration") result.push(child);
    if (child.kind === "ClassDeclaration" || child.kind === "NamespaceDeclaration") {
      result.push(...collectProperties(child));
    }
  }
  return result;
}

function collectTopLevelStatements(members: readonly TopLevelMember[]): Statement[] {
  const result: Statement[] = [];
  for (const member of members) {
    if (member.kind === "NamespaceDeclaration") {
      result.push(...collectTopLevelStatements(member.members));
      continue;
    }
    if (isStatement(member)) {
      result.push(member);
    }
  }
  return result;
}

function isStatement(member: TopLevelMember): member is Statement {
  switch (member.kind) {
    case "VariableDeclaration":
    case "DestructuredVariableDeclaration":
    case "Assignment":
    case "ExpressionStatement":
    case "OpaqueStatement":
    case "IfStatement":
    case "ForStatement":
    case "ForEachStatement":
    case "WhileStatement":
    case "TryCatchStatement":
    case "UsingStatement":
    case "MatchStatement":
    case "ReturnStatement":
    case "ExitStatement":
    case "ContinueStatement":
    case "ThrowStatement":
    case "Block":
    case "WithStatement":
    case "SelectCaseStatement":
      return true;
    default:
      return false;
  }
}

function collectStatements(statements: readonly Statement[], out: Statement[]): void {
  for (const statement of statements) {
    out.push(statement);
    switch (statement.kind) {
      case "IfStatement":
        collectStatements(statement.thenBranch, out);
        for (const branch of statement.elseIfBranches) collectStatements(branch.body, out);
        if (statement.elseBranch) collectStatements(statement.elseBranch, out);
        break;
      case "ForEachStatement":
      case "ForStatement":
      case "WhileStatement":
      case "WithStatement":
        collectStatements(statement.body, out);
        break;
      case "TryCatchStatement":
        collectStatements(statement.tryBody, out);
        collectStatements(statement.catchBody, out);
        if (statement.finallyBody) collectStatements(statement.finallyBody, out);
        break;
      case "UsingStatement":
        collectStatements(statement.body, out);
        break;
      case "MatchStatement":
        for (const matchCase of statement.cases) collectStatements(matchCase.body, out);
        break;
      case "Block":
        collectStatements(statement.statements, out);
        break;
      case "Assignment":
      case "ExpressionStatement":
      case "OpaqueStatement":
      case "ReturnStatement":
      case "VariableDeclaration":
      case "DestructuredVariableDeclaration":
        break;
    }
  }
}

function walkStatementExpressions(statement: Statement, visit: (expr: Expression) => void): void {
  switch (statement.kind) {
    case "Assignment":
      walkExpression(statement.target, visit);
      walkExpression(statement.value, visit);
      break;
    case "ExpressionStatement":
      walkExpression(statement.expression, visit);
      break;
    case "VariableDeclaration":
      if (statement.initializer) walkExpression(statement.initializer, visit);
      break;
    case "DestructuredVariableDeclaration":
      walkExpression(statement.initializer, visit);
      for (const b of statement.bindings) {
        if (b.defaultValue) walkExpression(b.defaultValue, visit);
      }
      break;
    case "ReturnStatement":
      if (statement.expression) walkExpression(statement.expression, visit);
      break;
    case "ForEachStatement":
      walkExpression(statement.enumerable, visit);
      break;
    case "ForStatement":
      walkExpression(statement.start, visit);
      walkExpression(statement.end, visit);
      if (statement.step) walkExpression(statement.step, visit);
      break;
    case "IfStatement":
      walkExpression(statement.condition, visit);
      break;
    case "WhileStatement":
      walkExpression(statement.condition, visit);
      break;
    case "UsingStatement":
      for (const arg of statement.resourceArgs) walkExpression(arg, visit);
      break;
    case "WithStatement":
      walkExpression(statement.expression, visit);
      break;
    case "TryCatchStatement":
    case "MatchStatement":
    case "Block":
    case "OpaqueStatement":
      break;
  }
}

function walkExpression(expr: Expression, visit: (expr: Expression) => void): void {
  visit(expr);
  switch (expr.kind) {
    case "ObjectCreationExpression":
      for (const arg of expr.arguments) walkExpression(arg, visit);
      break;
    case "MethodInvocation":
      if (expr.callee) walkExpression(expr.callee, visit);
      for (const arg of expr.arguments) walkExpression(arg, visit);
      break;
    case "MemberAccess":
      walkExpression(expr.target, visit);
      break;
    case "BinaryExpression":
      walkExpression(expr.left, visit);
      walkExpression(expr.right, visit);
      break;
    case "UnaryExpression":
      walkExpression(expr.argument, visit);
      break;
    case "TernaryExpression":
      walkExpression(expr.condition, visit);
      walkExpression(expr.trueExpr, visit);
      walkExpression(expr.falseExpr, visit);
      break;
    case "NullCoalescingExpression":
    case "PipeExpression":
      walkExpression(expr.left, visit);
      walkExpression(expr.right, visit);
      break;
    case "OptionalChainingExpression":
      walkExpression(expr.target, visit);
      walkExpression(expr.member, visit);
      break;
    case "Identifier":
    case "Literal":
    case "TaggedTemplateExpression":
      break;
  }
}

function dedupeLocals(locals: readonly AstLocalBinding[]): AstLocalBinding[] {
  const map = new Map<string, AstLocalBinding>();
  for (const local of locals) map.set(local.name.toLowerCase(), local);
  return Array.from(map.values());
}

function tokenRange(token: Token): vscode.Range {
  return tokenRangeFromLoc(
    {
      startLine: token.loc.line,
      startChar: token.loc.column,
      endLine: token.loc.line,
      endChar: tokenEndColumn(token),
    },
    token.value.length,
  );
}

function tokenRangeFromLoc(
  loc: { startLine: number; startChar: number; endLine: number; endChar: number } | undefined,
  fallbackLength: number,
): vscode.Range {
  const line = locLine(loc);
  const start = loc?.startChar ?? 0;
  const end = loc?.endChar && loc.endChar > start ? loc.endChar : start + fallbackLength;
  return new vscode.Range(line, start, line, end);
}

function symbolRange(symbol: SymbolInfo): vscode.Range {
  return new vscode.Range(
    symbol.range.startLine,
    symbol.range.startChar,
    symbol.range.endLine,
    symbol.range.endChar,
  );
}

function tokenEndColumn(token: Token): number {
  return token.loc.column + token.value.length;
}

function locLine(loc: { startLine: number } | undefined): number {
  return Math.max(0, (loc?.startLine ?? 1) - 1);
}

function isBeforeOrAt(
  loc: { startLine: number; startChar: number } | undefined,
  position: vscode.Position,
): boolean {
  if (!loc) return true;
  const line = locLine(loc);
  return line < position.line || (line === position.line && loc.startChar <= position.character);
}
