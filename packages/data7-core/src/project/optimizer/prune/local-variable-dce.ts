import {
  ASTWalker,
  type CompilationUnit,
  type Expression,
  type MethodDeclaration,
  type Node,
  type Statement,
  type VariableDeclaration,
} from "../../ast/ast";

export interface LocalVariableDceResult {
  readonly unit: CompilationUnit;
  readonly removed: readonly string[];
}

/**
 * Remove unused method/property/Using-body `Dim`/`Const` locals whose initializer
 * is side-effect free (or absent). Skips bodies that contain `OpaqueStatement`.
 * Does not remove Using/For/ForEach/Catch bindings (observable lifetime).
 */
export function pruneLocalVariablesInUnit(unit: CompilationUnit): LocalVariableDceResult {
  const removed: string[] = [];
  const rewriter = new LocalVariableDceRewriter(removed);
  const next = rewriter.rewriteUnit(unit);
  return { unit: next, removed };
}

class LocalVariableDceRewriter {
  public constructor(private readonly removed: string[]) {}

  public rewriteUnit(unit: CompilationUnit): CompilationUnit {
    return {
      ...unit,
      members: unit.members.map((member) => this.rewriteNode(member) as typeof member),
    };
  }

  private rewriteNode<T extends Node>(node: T): T {
    if (node.kind === "MethodDeclaration") {
      return this.rewriteMethod(node) as T;
    }
    if (node.kind === "PropertyDeclaration") {
      return {
        ...node,
        getter: node.getter ? this.rewriteMethod(node.getter) : undefined,
        setter: node.setter ? this.rewriteMethod(node.setter) : undefined,
      } as T;
    }
    if (node.kind === "ClassDeclaration") {
      return {
        ...node,
        members: node.members.map((member) => this.rewriteNode(member)),
      } as T;
    }
    if (node.kind === "NamespaceDeclaration") {
      return {
        ...node,
        members: node.members.map((member) => this.rewriteNode(member)),
      } as T;
    }
    if (isStatement(node)) {
      return this.rewriteStatement(node) as T;
    }
    return node;
  }

  private rewriteMethod(method: MethodDeclaration): MethodDeclaration {
    if (bodyHasOpaque(method.body)) return method;
    return {
      ...method,
      body: this.rewriteStatements(method.body),
    };
  }

  private rewriteStatement(statement: Statement): Statement {
    switch (statement.kind) {
      case "IfStatement":
        return {
          ...statement,
          thenBranch: this.rewriteStatements(statement.thenBranch),
          elseIfBranches: statement.elseIfBranches.map((branch) => ({
            ...branch,
            body: this.rewriteStatements(branch.body),
          })),
          elseBranch: statement.elseBranch
            ? this.rewriteStatements(statement.elseBranch)
            : undefined,
        };
      case "ForStatement":
        return { ...statement, body: this.rewriteStatements(statement.body) };
      case "ForEachStatement":
        return { ...statement, body: this.rewriteStatements(statement.body) };
      case "WhileStatement":
        return { ...statement, body: this.rewriteStatements(statement.body) };
      case "UsingStatement":
        return { ...statement, body: this.rewriteStatements(statement.body) };
      case "TryCatchStatement":
        return {
          ...statement,
          tryBody: this.rewriteStatements(statement.tryBody),
          catchBody: this.rewriteStatements(statement.catchBody),
          finallyBody: statement.finallyBody
            ? this.rewriteStatements(statement.finallyBody)
            : undefined,
        };
      case "SelectCaseStatement":
        return {
          ...statement,
          cases: statement.cases.map((branch) => ({
            ...branch,
            body: this.rewriteStatements(branch.body),
          })),
        };
      case "WithStatement":
        return { ...statement, body: this.rewriteStatements(statement.body) };
      case "Block":
        return { ...statement, statements: this.rewriteStatements(statement.statements) };
      default:
        return statement;
    }
  }

  private rewriteStatements(statements: readonly Statement[]): Statement[] {
    if (bodyHasOpaque(statements)) return [...statements];

    const used = collectUsedLocalNames(statements);
    const result: Statement[] = [];
    for (const statement of statements) {
      if (statement.kind === "VariableDeclaration") {
        if (!used.has(statement.name.toLowerCase()) && canDropLocalDeclaration(statement)) {
          this.removed.push(`local:${statement.name}`);
          continue;
        }
        result.push(statement);
        continue;
      }
      if (statement.kind === "Block") {
        const nested = this.rewriteStatements(statement.statements);
        if (nested.length === 0) continue;
        if (nested.length === 1) {
          const only = nested[0];
          if (only) result.push(only);
          continue;
        }
        result.push({ ...statement, statements: nested });
        continue;
      }
      result.push(this.rewriteStatement(statement));
    }
    return result;
  }
}

function isStatement(node: Node): node is Statement {
  switch (node.kind) {
    case "ExpressionStatement":
    case "Assignment":
    case "VariableDeclaration":
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
    case "SelectCaseStatement":
    case "DestructuredVariableDeclaration":
      return true;
    default:
      return false;
  }
}

function bodyHasOpaque(statements: readonly Statement[]): boolean {
  for (const statement of statements) {
    if (statement.kind === "OpaqueStatement") return true;
    if (statement.kind === "Block" && bodyHasOpaque(statement.statements)) return true;
    if (statement.kind === "IfStatement") {
      if (bodyHasOpaque(statement.thenBranch)) return true;
      for (const branch of statement.elseIfBranches) {
        if (bodyHasOpaque(branch.body)) return true;
      }
      if (statement.elseBranch && bodyHasOpaque(statement.elseBranch)) return true;
    }
    if (statement.kind === "ForStatement" && bodyHasOpaque(statement.body)) return true;
    if (statement.kind === "ForEachStatement" && bodyHasOpaque(statement.body)) return true;
    if (statement.kind === "WhileStatement" && bodyHasOpaque(statement.body)) return true;
    if (statement.kind === "UsingStatement" && bodyHasOpaque(statement.body)) return true;
    if (statement.kind === "WithStatement" && bodyHasOpaque(statement.body)) return true;
    if (statement.kind === "TryCatchStatement") {
      if (bodyHasOpaque(statement.tryBody) || bodyHasOpaque(statement.catchBody)) return true;
      if (statement.finallyBody && bodyHasOpaque(statement.finallyBody)) return true;
    }
    if (statement.kind === "SelectCaseStatement") {
      for (const branch of statement.cases) {
        if (bodyHasOpaque(branch.body)) return true;
      }
    }
  }
  return false;
}

function canDropLocalDeclaration(declaration: VariableDeclaration): boolean {
  if (declaration.nativeArrayDimensions && declaration.nativeArrayDimensions.length > 0) {
    return declaration.nativeArrayDimensions.every((dimension) => isSideEffectFree(dimension));
  }
  if (!declaration.initializer) return true;
  return isSideEffectFree(declaration.initializer);
}

function isSideEffectFree(expression: Expression): boolean {
  switch (expression.kind) {
    case "Literal":
    case "Identifier":
    case "TypeReferenceExpression":
      return true;
    case "UnaryExpression":
      return isSideEffectFree(expression.argument);
    case "BinaryExpression":
      return isSideEffectFree(expression.left) && isSideEffectFree(expression.right);
    case "TernaryExpression":
      return (
        isSideEffectFree(expression.condition) &&
        isSideEffectFree(expression.trueExpr) &&
        isSideEffectFree(expression.falseExpr)
      );
    case "NullCoalescingExpression":
      return isSideEffectFree(expression.left) && isSideEffectFree(expression.right);
    case "ArrayLiteralExpression":
      return expression.elements.every((element) =>
        element.kind === "SpreadExpression"
          ? isSideEffectFree(element.expression)
          : isSideEffectFree(element),
      );
    case "SpreadExpression":
      return isSideEffectFree(expression.expression);
    default:
      // MethodInvocation / New / MemberAccess / OptionalChaining / etc. may have effects.
      return false;
  }
}

/**
 * Collect identifier names that are *reads* (or assignment targets) of locals.
 * Declaration names themselves are not counted as uses.
 */
function collectUsedLocalNames(statements: readonly Statement[]): Set<string> {
  const used = new Set<string>();
  const walker = new (class extends ASTWalker {
    public override walk(node: Node | undefined): void {
      if (!node) return;
      if (node.kind === "VariableDeclaration") {
        if (node.type) this.walk(node.type);
        if (node.initializer) this.walk(node.initializer);
        if (node.nativeArrayDimensions) {
          for (const dimension of node.nativeArrayDimensions) this.walk(dimension);
        }
        return;
      }
      if (node.kind === "MemberAccess") {
        this.walk(node.target);
        // `member` is a field/method name, not a local variable binding.
        return;
      }
      if (node.kind === "MethodInvocation") {
        if (node.callee) this.walk(node.callee);
        // methodName is not a local binding.
        for (const typeArg of node.typeArguments) this.walk(typeArg);
        for (const arg of node.arguments) this.walk(arg);
        return;
      }
      if (node.kind === "Identifier") {
        used.add(node.name.toLowerCase());
        return;
      }
      super.walk(node);
    }
  })();

  for (const statement of statements) walker.walk(statement);
  return used;
}
