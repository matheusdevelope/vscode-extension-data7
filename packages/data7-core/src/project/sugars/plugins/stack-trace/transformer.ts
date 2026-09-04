import type {
  ClassMember,
  Expression,
  ExpressionStatement,
  Identifier,
  ImportsDeclaration,
  Literal,
  MethodDeclaration,
  MethodInvocation,
  Node,
  SourceLocation,
  Statement,
  TopLevelMember,
  TryCatchStatement,
} from "../../../ast/ast";
import { BUILD_SERIALIZE_OPTIONS, parseBasic, serializeUnit } from "../../../parser";
import type { StackTraceTranspileOptions } from "../../../transpiler-types";

export const STACK_TRACE_SUGAR_ID = "stack-trace";
export const STACK_TRACE_NAMESPACE = "StackTrace";
export const STACK_TRACE_MODULE_NAME = "mod_stacktrace";

const SYNTHETIC_METHOD_NAME = "__syntheticmethod";
const METHOD_EXIT_TARGETS = new Set(["Sub", "Function", "Property"]);

const DEFAULT_OPTIONS: StackTraceTranspileOptions = {
  locationMode: "source",
  sourceFilePath: "",
  moduleName: "",
  wrapPrincipal: false,
};

export class StackTraceSugarTransformer {
  public readonly usedSugars = new Set<string>();
  private instrumented = false;
  private readonly options: StackTraceTranspileOptions;

  constructor(options?: Partial<StackTraceTranspileOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  public transform(unit: { members: TopLevelMember[]; loc?: Node["loc"] }): void {
    if (this.isRuntimeModule(unit.members)) {
      return;
    }

    unit.members = unit.members.map((member) => this.transformTopLevelMember(member, "", ""));
    if (this.options.wrapPrincipal) {
      this.wrapPrincipalEntry(unit);
    }
    if (this.instrumented) {
      this.usedSugars.add(STACK_TRACE_SUGAR_ID);
    }
  }

  /**
   * After prune/minify/uglify, rewrite Push file/line to the packaged unit
   * name and the declaration line in the generated source.
   */
  public rewriteGeneratedLocations(unit: { members: TopLevelMember[] }): void {
    if (this.isRuntimeModule(unit.members)) return;
    const fileLabel = packagedUnitFileName(this.options.moduleName);
    this.rewriteMembers(unit.members, fileLabel);
  }

  /**
   * The runtime in `mod_stacktrace.bas` (`Namespace StackTrace`) must never be
   * instrumented: injecting `Push` into `Push`/`Pop`/`Report`/`Clean` would
   * recurse forever. Every other module — including `core_modules` such as
   * `mod_logger` / `mod_tlist` — is fair game.
   */
  private isRuntimeModule(members: readonly TopLevelMember[]): boolean {
    const moduleName = this.options.moduleName.replace(/\.bas$/i, "").toLowerCase();
    if (moduleName === STACK_TRACE_MODULE_NAME) {
      return true;
    }
    const source = this.options.sourceFilePath.replace(/\\/g, "/").toLowerCase();
    if (/(?:^|\/)mod_stacktrace\.bas$/.test(source)) {
      return true;
    }
    return members.some(
      (member) =>
        member.kind === "NamespaceDeclaration" &&
        member.name.toLowerCase() === STACK_TRACE_NAMESPACE.toLowerCase(),
    );
  }

  private transformTopLevelMember(
    member: TopLevelMember,
    namespaceName: string,
    className: string,
  ): TopLevelMember {
    switch (member.kind) {
      case "ImportsDeclaration":
      case "DelegateDeclaration":
      case "EnumDeclaration":
      case "OpaqueStatement":
      case "FieldDeclaration":
        return member;
      case "NamespaceDeclaration":
        if (member.name.toLowerCase() === STACK_TRACE_NAMESPACE.toLowerCase()) {
          return member;
        }
        member.members = member.members.map((child) =>
          this.transformTopLevelMember(child, member.name, className),
        );
        return member;
      case "ClassDeclaration":
        member.members = member.members.map((child) =>
          this.transformClassMember(child, namespaceName, member.name),
        );
        return member;
      case "MethodDeclaration":
        this.instrumentMethod(member, namespaceName, className, member.name);
        return member;
      case "VariableDeclaration":
      case "ExpressionStatement":
      case "Assignment":
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
      case "DestructuredVariableDeclaration":
      case "SelectCaseStatement":
        return member;
    }
  }

  private transformClassMember(
    member: ClassMember,
    namespaceName: string,
    className: string,
  ): ClassMember {
    switch (member.kind) {
      case "MethodDeclaration":
        this.instrumentMethod(member, namespaceName, className, member.name);
        return member;
      case "FieldDeclaration":
        return member;
      case "PropertyDeclaration":
        if (member.getter) {
          this.instrumentMethod(member.getter, namespaceName, className, `${member.name}.Get`);
        }
        if (member.setter) {
          this.instrumentMethod(member.setter, namespaceName, className, `${member.name}.Set`);
        }
        return member;
      case "ClassDeclaration":
        member.members = member.members.map((child) =>
          this.transformClassMember(child, namespaceName, member.name),
        );
        return member;
    }
  }

  private instrumentMethod(
    method: MethodDeclaration,
    namespaceName: string,
    className: string,
    methodName: string,
  ): void {
    if (method.modifiers?.includes("declare")) return;
    if (method.name.toLowerCase() === SYNTHETIC_METHOD_NAME) return;
    if (isStackTracePushStatement(method.body[0])) return;

    const displayName = qualifyName(namespaceName, className, methodName, this.options.moduleName);
    const fileLabel = this.fileLabel();
    const line = method.loc?.startLine ?? 0;
    const loc = method.loc;

    method.body = [
      stackTraceCall(
        "Push",
        [stringLiteral(displayName, loc), stringLiteral(fileLabel, loc), numberLiteral(line, loc)],
        loc,
      ),
      ...this.insertPopsBeforeExits(method.body),
    ];
    if (!this.bodyExits(method.body[method.body.length - 1])) {
      method.body.push(stackTraceCall("Pop", [], loc));
    }
    this.instrumented = true;
  }

  private insertPopsInStatement(statement: Statement): Statement {
    switch (statement.kind) {
      case "IfStatement":
        statement.thenBranch = this.insertPopsBeforeExits(statement.thenBranch);
        for (const branch of statement.elseIfBranches) {
          branch.body = this.insertPopsBeforeExits(branch.body);
        }
        if (statement.elseBranch) {
          statement.elseBranch = this.insertPopsBeforeExits(statement.elseBranch);
        }
        return statement;
      case "ForStatement":
      case "ForEachStatement":
      case "WhileStatement":
        statement.body = this.insertPopsBeforeExits(statement.body);
        return statement;
      case "TryCatchStatement":
        statement.tryBody = this.insertPopsBeforeExits(statement.tryBody);
        statement.catchBody = this.insertPopsBeforeExits(statement.catchBody);
        if (statement.finallyBody) {
          statement.finallyBody = this.insertPopsBeforeExits(statement.finallyBody);
        }
        return statement;
      case "UsingStatement":
        statement.body = this.insertPopsBeforeExits(statement.body);
        return statement;
      case "Block":
        statement.statements = this.insertPopsBeforeExits(statement.statements);
        return statement;
      case "WithStatement":
        statement.body = this.insertPopsBeforeExits(statement.body);
        return statement;
      case "SelectCaseStatement":
        for (const branch of statement.cases) {
          branch.body = this.insertPopsBeforeExits(branch.body);
        }
        return statement;
      default:
        return statement;
    }
  }

  private insertPopsBeforeExits(statements: Statement[]): Statement[] {
    const result: Statement[] = [];
    for (const statement of statements) {
      const transformed = this.insertPopsInStatement(statement);
      if (this.isMethodExit(transformed)) {
        result.push(stackTraceCall("Pop", [], transformed.loc));
      }
      result.push(transformed);
    }
    return result;
  }

  private isMethodExit(statement: Statement): boolean {
    if (statement.kind === "ReturnStatement") return true;
    return statement.kind === "ExitStatement" && METHOD_EXIT_TARGETS.has(statement.target);
  }

  private bodyExits(statement: Statement | undefined): boolean {
    return statement !== undefined && this.isMethodExit(statement);
  }

  /**
   * Always wrap Principal after Imports. Script-style files (Dim + calls, no
   * Sub/Class) are parsed inside `__syntheticMethod`; wrap that body so the
   * Try survives when the synthetic Sub is stripped. Type/method declarations
   * stay outside the Try; Dims and executable statements go inside.
   */
  private wrapPrincipalEntry(unit: { members: TopLevelMember[]; loc?: Node["loc"] }): void {
    const loc = unit.loc;
    const synthetic = unit.members.find(
      (member): member is MethodDeclaration =>
        member.kind === "MethodDeclaration" && member.name.toLowerCase() === SYNTHETIC_METHOD_NAME,
    );
    if (synthetic) {
      const split = liftImportsFromStatements(synthetic.body, loc);
      synthetic.body = [this.createPrincipalTry(split.rest, loc)];
      if (split.imports.length > 0) {
        const methodIdx = unit.members.indexOf(synthetic);
        unit.members.splice(methodIdx, 0, ...split.imports);
      }
      this.instrumented = true;
      return;
    }

    let lastImport = -1;
    for (let i = 0; i < unit.members.length; i++) {
      if (unit.members[i]?.kind === "ImportsDeclaration") {
        lastImport = i;
      }
    }
    const prefix = unit.members.slice(0, lastImport + 1);
    const rest = unit.members.slice(lastImport + 1);
    const declarations: TopLevelMember[] = [];
    const wrapable: Statement[] = [];
    for (const member of rest) {
      if (isPrincipalTypeOrMethodDeclaration(member)) {
        declarations.push(member);
      } else {
        wrapable.push(member as Statement);
      }
    }
    unit.members = [...prefix, ...declarations, this.createPrincipalTry(wrapable, loc)];
    this.instrumented = true;
  }

  private createPrincipalTry(
    tryBody: Statement[],
    loc: SourceLocation | undefined,
  ): TryCatchStatement {
    return {
      kind: "TryCatchStatement",
      tryBody,
      catchVar: identifier("ex", loc),
      catchType: { kind: "TypeReference", name: "Exception", typeArguments: [], loc },
      catchBody: [
        {
          kind: "ExpressionStatement",
          loc,
          expression: {
            kind: "MethodInvocation",
            callee: identifier("mod_logger", loc),
            methodName: "Printe",
            typeArguments: [],
            arguments: [stackTraceInvocation("Report", [identifier("ex", loc)], loc)],
            loc,
          },
        },
        stackTraceCall("Clean", [], loc),
        { kind: "ThrowStatement", loc },
      ],
      finallyBody: [stackTraceCall("Clean", [], loc)],
      loc,
    };
  }

  private fileLabel(): string {
    if (this.options.locationMode === "generated") {
      return packagedUnitFileName(this.options.moduleName);
    }
    return this.options.sourceFilePath;
  }

  private rewriteMembers(members: TopLevelMember[], fileLabel: string): void {
    for (const member of members) {
      if (member.kind === "NamespaceDeclaration") {
        if (member.name.toLowerCase() === STACK_TRACE_NAMESPACE.toLowerCase()) continue;
        this.rewriteMembers(member.members, fileLabel);
        continue;
      }
      if (member.kind === "ClassDeclaration") {
        this.rewriteClassMembers(member.members, fileLabel);
        continue;
      }
      if (member.kind === "MethodDeclaration") {
        this.rewriteMethodPush(member, fileLabel);
      }
    }
  }

  private rewriteClassMembers(members: readonly ClassMember[], fileLabel: string): void {
    for (const member of members) {
      if (member.kind === "MethodDeclaration") {
        this.rewriteMethodPush(member, fileLabel);
      } else if (member.kind === "PropertyDeclaration") {
        if (member.getter) this.rewriteMethodPush(member.getter, fileLabel);
        if (member.setter) this.rewriteMethodPush(member.setter, fileLabel);
      } else if (member.kind === "ClassDeclaration") {
        this.rewriteClassMembers(member.members, fileLabel);
      }
    }
  }

  private rewriteMethodPush(method: MethodDeclaration, fileLabel: string): void {
    const first = method.body[0];
    if (!isStackTracePushStatement(first)) return;
    const invocation = first.expression;
    if (invocation.kind !== "MethodInvocation") return;
    const line = method.loc?.startLine ?? 0;
    if (invocation.arguments[1]) {
      invocation.arguments[1] = stringLiteral(fileLabel, invocation.loc);
    }
    if (invocation.arguments[2]) {
      invocation.arguments[2] = numberLiteral(line, invocation.loc);
    }
  }
}

export function packagedUnitFileName(moduleName: string): string {
  const trimmed = moduleName.trim();
  if (!trimmed) return "Principal.bas";
  return trimmed.toLowerCase().endsWith(".bas") ? trimmed : `${trimmed}.bas`;
}

/** Re-parses generated code and rewrites Push file/line to the packaged unit. */
export function rewriteGeneratedStackTraceLocations(code: string, moduleName: string): string {
  const unitName = moduleName.replace(/\.bas$/i, "").toLowerCase();
  if (unitName === STACK_TRACE_MODULE_NAME) return code;
  const parsed = parseBasic(code);
  if (parsed.errors.length > 0) return code;
  const transformer = new StackTraceSugarTransformer({
    locationMode: "generated",
    sourceFilePath: "",
    moduleName,
    wrapPrincipal: false,
  });
  transformer.rewriteGeneratedLocations(parsed.unit);
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  return serializeUnit(parsed.unit, { eol, ...BUILD_SERIALIZE_OPTIONS });
}

function qualifyName(
  namespaceName: string,
  className: string,
  methodName: string,
  moduleName: string,
): string {
  const parts: string[] = [];
  if (namespaceName) {
    parts.push(namespaceName);
  } else if (moduleName) {
    parts.push(moduleName.replace(/\.bas$/i, ""));
  }
  if (className) parts.push(className);
  if (methodName) parts.push(methodName);
  return parts.join(".");
}

function isPrincipalTypeOrMethodDeclaration(member: TopLevelMember): boolean {
  switch (member.kind) {
    case "ImportsDeclaration":
    case "NamespaceDeclaration":
    case "ClassDeclaration":
    case "MethodDeclaration":
    case "DelegateDeclaration":
    case "EnumDeclaration":
    case "FieldDeclaration":
      return true;
    default:
      return false;
  }
}

function liftImportsFromStatements(
  statements: readonly Statement[],
  loc: SourceLocation | undefined,
): { imports: ImportsDeclaration[]; rest: Statement[] } {
  const imports: ImportsDeclaration[] = [];
  const rest: Statement[] = [];
  for (const statement of statements) {
    if (statement.kind === "OpaqueStatement") {
      const lifted = parseOpaqueImports(statement.text, statement.loc ?? loc);
      if (lifted) {
        imports.push(...lifted);
        continue;
      }
    }
    rest.push(statement);
  }
  return { imports, rest };
}

function parseOpaqueImports(
  text: string,
  loc: SourceLocation | undefined,
): ImportsDeclaration[] | undefined {
  const match = /^\s*Imports\s+(.+?)\s*$/i.exec(text);
  const list = match?.[1];
  if (!list) return undefined;
  const targets = list
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (targets.length === 0) return undefined;
  return targets.map((target) => ({ kind: "ImportsDeclaration", target, loc }));
}

function isStackTracePushStatement(
  statement: Statement | undefined,
): statement is ExpressionStatement {
  if (!statement || statement.kind !== "ExpressionStatement") return false;
  const expression = statement.expression;
  if (expression.kind !== "MethodInvocation") return false;
  if (expression.methodName.toLowerCase() !== "push") return false;
  return calleeIsStackTrace(expression);
}

function calleeIsStackTrace(expression: MethodInvocation): boolean {
  const callee = expression.callee;
  return (
    callee?.kind === "Identifier" &&
    callee.name.toLowerCase() === STACK_TRACE_NAMESPACE.toLowerCase()
  );
}

function stackTraceCall(
  methodName: string,
  args: Expression[],
  loc: SourceLocation | undefined,
): Statement {
  return {
    kind: "ExpressionStatement",
    loc,
    expression: stackTraceInvocation(methodName, args, loc),
  };
}

function stackTraceInvocation(
  methodName: string,
  args: Expression[],
  loc: SourceLocation | undefined,
): MethodInvocation {
  return {
    kind: "MethodInvocation",
    callee: identifier(STACK_TRACE_NAMESPACE, loc),
    methodName,
    typeArguments: [],
    arguments: args,
    loc,
  };
}

function identifier(name: string, loc: SourceLocation | undefined): Identifier {
  return { kind: "Identifier", name, loc };
}

function stringLiteral(value: string, loc: SourceLocation | undefined): Literal {
  return { kind: "Literal", value: `"${value.replace(/"/g, '""')}"`, loc };
}

function numberLiteral(value: number, loc: SourceLocation | undefined): Literal {
  return { kind: "Literal", value, loc };
}
