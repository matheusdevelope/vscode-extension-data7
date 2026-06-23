import type {
  BinaryExpression,
  DestructuredVariableDeclaration,
  Identifier,
  MemberAccess,
  MethodInvocation,
  Statement,
  VariableDeclaration,
} from "../../../ast/ast";

export interface DestructureTransformContext {
  freshSource(): string;
}

/** Expands object and array binding declarations into native local statements. */
export function expandDestructuredVariableDeclaration(
  declaration: DestructuredVariableDeclaration,
  context: DestructureTransformContext,
): Statement[] {
  const sourceName =
    declaration.initializer.kind === "Identifier"
      ? declaration.initializer.name
      : context.freshSource();
  const statements: Statement[] = [];

  if (declaration.initializer.kind !== "Identifier") {
    statements.push({
      kind: "VariableDeclaration",
      name: sourceName,
      initializer: declaration.initializer,
      loc: declaration.loc,
    });
  }

  const sourceRef: Identifier = { kind: "Identifier", name: sourceName, loc: declaration.loc };

  if (declaration.isObject) {
    declaration.bindings.forEach((binding) => {
      const access: MemberAccess = {
        kind: "MemberAccess",
        target: sourceRef,
        member: binding.property ?? binding.name,
        loc: declaration.loc,
      };
      const variable: VariableDeclaration = {
        kind: "VariableDeclaration",
        name: binding.name,
        initializer: access,
        loc: declaration.loc,
      };
      statements.push(variable);
      if (binding.defaultValue !== undefined) {
        const checkNull: BinaryExpression = {
          kind: "BinaryExpression",
          left: { kind: "Identifier", name: binding.name, loc: declaration.loc },
          operator: "=",
          right: { kind: "Literal", value: null, loc: declaration.loc },
          loc: declaration.loc,
        };
        const checkEmpty: BinaryExpression = {
          kind: "BinaryExpression",
          left: { kind: "Identifier", name: binding.name, loc: declaration.loc },
          operator: "=",
          right: { kind: "Literal", value: `""`, loc: declaration.loc },
          loc: declaration.loc,
        };
        statements.push({
          kind: "IfStatement",
          condition: {
            kind: "BinaryExpression",
            left: checkNull,
            operator: "Or",
            right: checkEmpty,
            loc: declaration.loc,
          },
          thenBranch: [
            {
              kind: "Assignment",
              target: { kind: "Identifier", name: binding.name, loc: declaration.loc },
              value: binding.defaultValue,
              loc: declaration.loc,
            },
          ],
          elseIfBranches: [],
          loc: declaration.loc,
          singleLine: true,
        });
      }
    });
    return statements;
  }

  declaration.bindings.forEach((binding, index) => {
    if (binding.isRest) {
      const indexName = context.freshSource();
      const indexVar: Identifier = { kind: "Identifier", name: indexName, loc: declaration.loc };
      statements.push({
        kind: "VariableDeclaration",
        name: binding.name,
        type: {
          kind: "TypeReference",
          name: "StringList",
          typeArguments: [],
          loc: declaration.loc,
        },
        initializer: {
          kind: "ObjectCreationExpression",
          type: {
            kind: "TypeReference",
            name: "StringList",
            typeArguments: [],
            loc: declaration.loc,
          },
          arguments: [],
          loc: declaration.loc,
        },
        loc: declaration.loc,
      });
      const countExpr: MemberAccess = {
        kind: "MemberAccess",
        target: sourceRef,
        member: "Count",
        loc: declaration.loc,
      };
      statements.push({
        kind: "ForStatement",
        counter: indexVar,
        start: { kind: "Literal", value: index, loc: declaration.loc },
        end: {
          kind: "BinaryExpression",
          left: countExpr,
          operator: "-",
          right: { kind: "Literal", value: 1, loc: declaration.loc },
          loc: declaration.loc,
        },
        body: [
          {
            kind: "ExpressionStatement",
            expression: {
              kind: "MethodInvocation",
              callee: { kind: "Identifier", name: binding.name, loc: declaration.loc },
              methodName: "Add",
              typeArguments: [],
              arguments: [
                {
                  kind: "MethodInvocation",
                  callee: sourceRef,
                  methodName: "Item",
                  typeArguments: [],
                  arguments: [indexVar],
                  loc: declaration.loc,
                },
              ],
              loc: declaration.loc,
            },
            loc: declaration.loc,
          },
        ],
        loc: declaration.loc,
      });
      return;
    }

    const itemCall: MethodInvocation = {
      kind: "MethodInvocation",
      callee: sourceRef,
      methodName: "Item",
      typeArguments: [],
      arguments: [{ kind: "Literal", value: index, loc: declaration.loc }],
      loc: declaration.loc,
    };
    statements.push({
      kind: "VariableDeclaration",
      name: binding.name,
      initializer: itemCall,
      loc: declaration.loc,
    });
  });

  return statements;
}
