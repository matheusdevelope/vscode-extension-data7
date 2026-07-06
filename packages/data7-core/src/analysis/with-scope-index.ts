import type {
  ClassDeclaration,
  CompilationUnit,
  Expression,
  NamespaceDeclaration,
  SourceLocation,
  Statement,
} from "../project/ast/ast";

/**
 * Maps each 1-based source line to the stack of active `With` expressions
 * (outermost first). Used to resolve leading-dot member access (`.Text`)
 * and to drive completion inside `With` blocks, including nesting.
 */
export function isWithRelativeMemberAccess(expression: Expression): boolean {
  return (
    expression.kind === "MemberAccess" &&
    expression.target.kind === "Identifier" &&
    expression.target.name === ""
  );
}

export class WithScopeIndex {
  private constructor(private readonly stackByLine: Map<number, readonly Expression[]>) {}

  public static build(unit: CompilationUnit): WithScopeIndex {
    const stackByLine = new Map<number, readonly Expression[]>();
    const walk = (statements: readonly Statement[], stack: readonly Expression[]): void => {
      for (const statement of statements) {
        recordLocRange(statement.loc, stack, stackByLine);
        switch (statement.kind) {
          case "WithStatement":
            walk(statement.body, [...stack, statement.expression]);
            break;
          case "IfStatement":
            walk(statement.thenBranch, stack);
            for (const branch of statement.elseIfBranches) {
              walk(branch.body, stack);
            }
            if (statement.elseBranch) {
              walk(statement.elseBranch, stack);
            }
            break;
          case "ForStatement":
          case "ForEachStatement":
          case "WhileStatement":
            walk(statement.body, stack);
            break;
          case "TryCatchStatement":
            walk(statement.tryBody, stack);
            walk(statement.catchBody, stack);
            if (statement.finallyBody) {
              walk(statement.finallyBody, stack);
            }
            break;
          case "UsingStatement":
            walk(statement.body, stack);
            break;
          case "Block":
            walk(statement.statements, stack);
            break;
          case "SelectCaseStatement":
            for (const caseClause of statement.cases) {
              walk(caseClause.body, stack);
            }
            break;
          default:
            break;
        }
      }
    };

    const walkNamespace = (namespace: NamespaceDeclaration, stack: readonly Expression[]): void => {
      for (const member of namespace.members) {
        if (member.kind === "ClassDeclaration") {
          walkClass(member, stack);
        } else if (member.kind === "NamespaceDeclaration") {
          walkNamespace(member, stack);
        } else if (member.kind === "MethodDeclaration") {
          walk(member.body, stack);
        }
      }
    };

    const walkClass = (klass: ClassDeclaration, stack: readonly Expression[]): void => {
      for (const member of klass.members) {
        if (member.kind === "MethodDeclaration") {
          walk(member.body, stack);
        } else if (member.kind === "PropertyDeclaration") {
          if (member.getter) {
            walk(member.getter.body, stack);
          }
          if (member.setter) {
            walk(member.setter.body, stack);
          }
        }
      }
    };

    for (const member of unit.members) {
      if (member.kind === "NamespaceDeclaration") {
        walkNamespace(member, []);
      } else if (member.kind === "ClassDeclaration") {
        walkClass(member, []);
      } else if (member.kind === "MethodDeclaration") {
        walk(member.body, []);
      }
    }

    return new WithScopeIndex(stackByLine);
  }

  public getInnermostTarget(lineOneBased: number): Expression | undefined {
    const stack = this.stackByLine.get(lineOneBased);
    if (!stack || stack.length === 0) {
      return undefined;
    }
    return stack[stack.length - 1];
  }

  public getStack(lineOneBased: number): readonly Expression[] {
    return this.stackByLine.get(lineOneBased) ?? [];
  }
}

function recordLocRange(
  loc: SourceLocation | undefined,
  stack: readonly Expression[],
  target: Map<number, readonly Expression[]>,
): void {
  if (!loc) return;
  for (let line = loc.startLine; line <= loc.endLine; line++) {
    target.set(line, stack);
  }
}

const withScopeIndexCacheHolder = {
  map: new WeakMap<object, WithScopeIndex>(),
};

export function getOrBuildWithScopeIndex(unit: CompilationUnit): WithScopeIndex {
  let index = withScopeIndexCacheHolder.map.get(unit);
  if (!index) {
    index = WithScopeIndex.build(unit);
    withScopeIndexCacheHolder.map.set(unit, index);
  }
  return index;
}
