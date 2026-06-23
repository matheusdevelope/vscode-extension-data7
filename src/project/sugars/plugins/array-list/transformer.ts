import { deepClone } from "../../../ast/clone";
import {
  ASTWalker,
  type Expression,
  type ExpressionStatement,
  type Identifier,
  type MethodInvocation,
  type Node,
  type ParameterDeclaration,
  type Statement,
  type TypeReference,
  type VariableDeclaration,
} from "../../../ast/ast";
interface ListVariableInfo {
  readonly type: TypeReference;
  readonly elementType?: TypeReference;
}

/**
 * Owns lowering of TTList<T>, collection literals, spreads and functional
 * collection operations. The AST transformer supplies traversal and context.
 */
export abstract class ArrayListSugarTransformer extends ASTWalker {
  protected abstract readonly usedSugars: Set<string>;
  protected readonly listVariableScopes: Map<string, ListVariableInfo>[] = [
    new Map<string, ListVariableInfo>(),
  ];

  protected createListScope(): Map<string, ListVariableInfo> {
    return new Map<string, ListVariableInfo>();
  }

  protected abstract isSugarEnabled(id: string): boolean;
  protected abstract freshIndex(): string;
  protected abstract freshSource(): string;
  protected abstract transformExpression(
    expression: Expression,
    stringContext: boolean,
    startLine?: number,
  ): Expression;
  protected abstract transformStatements(statements: Statement[]): Statement[];
  protected expandFunctionalListDeclaration(
    declaration: VariableDeclaration,
  ): Statement[] | undefined {
    if (!this.isSugarEnabled("array-list")) return undefined;
    if (declaration.initializer?.kind !== "MethodInvocation") return undefined;
    const call = declaration.initializer;
    const methodName = call.methodName.toLowerCase();
    if (!["map", "filter", "find", "findindex", "some", "every", "reduce"].includes(methodName)) {
      return undefined;
    }
    if (!call.callee) return undefined;
    const sourceInfo = this.getListExpressionInfo(call.callee);
    if (!sourceInfo) return undefined;
    const arrow = call.arguments[0];
    if (arrow?.kind !== "ArrowFunctionExpression") return undefined;
    if (Array.isArray(arrow.body) && methodName !== "foreach") return undefined;

    this.usedSugars.add("array-list");

    switch (methodName) {
      case "map":
        if (
          !declaration.type ||
          !this.isTTListType(declaration.type) ||
          Array.isArray(arrow.body)
        ) {
          return undefined;
        }
        this.rememberListVariable(declaration.name, declaration.type);
        return this.expandMapDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "filter":
        if (
          !declaration.type ||
          !this.isTTListType(declaration.type) ||
          Array.isArray(arrow.body)
        ) {
          return undefined;
        }
        this.rememberListVariable(declaration.name, declaration.type);
        return this.expandFilterDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "find":
        if (Array.isArray(arrow.body)) return undefined;
        return this.expandFindDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "findindex":
        if (Array.isArray(arrow.body)) return undefined;
        return this.expandFindIndexDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "some":
        if (Array.isArray(arrow.body)) return undefined;
        return this.expandSomeDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "every":
        if (Array.isArray(arrow.body)) return undefined;
        return this.expandEveryDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "reduce":
        if (Array.isArray(arrow.body)) return undefined;
        return this.expandReduceDeclaration(
          declaration,
          call.callee,
          sourceInfo,
          arrow,
          call.arguments[1],
        );
      default:
        return undefined;
    }
  }

  protected expandFunctionalForEachStatement(
    statement: ExpressionStatement,
  ): Statement[] | undefined {
    if (!this.isSugarEnabled("array-list")) return undefined;
    if (statement.expression.kind !== "MethodInvocation") return undefined;
    const call = statement.expression;
    if (call.methodName.toLowerCase() !== "foreach" || !call.callee) return undefined;
    const sourceInfo = this.getListExpressionInfo(call.callee);
    if (!sourceInfo) return undefined;
    const arrow = call.arguments[0];
    if (arrow?.kind !== "ArrowFunctionExpression") return undefined;

    this.usedSugars.add("array-list");
    const loop = this.createFunctionalLoop(call.callee, sourceInfo, arrow, statement.loc);
    const body = this.createLambdaParameterDeclarations(
      call.callee,
      sourceInfo,
      arrow,
      loop.idxVar,
      0,
    );

    if (Array.isArray(arrow.body)) {
      body.push(...this.transformStatements(arrow.body));
    } else {
      body.push({
        kind: "ExpressionStatement",
        expression: this.transformExpression(arrow.body, true, statement.loc?.startLine),
        loc: arrow.body.loc ?? statement.loc,
      });
    }
    loop.forStatement.body = body;
    return [loop.idxDeclaration, loop.forStatement];
  }

  protected expandMapDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push({
      kind: "ExpressionStatement",
      expression: {
        kind: "MethodInvocation",
        callee: targetRef,
        methodName: "Push",
        typeArguments: [],
        arguments: [
          this.transformExpression(arrow.body as Expression, false, declaration.loc?.startLine),
        ],
        loc: declaration.loc,
      },
      loc: declaration.loc,
    });
    loop.forStatement.body = body;
    return [this.createListResultDeclaration(declaration), loop.idxDeclaration, loop.forStatement];
  }

  protected expandFilterDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    const itemExpr = this.getLambdaItemReference(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push({
      kind: "IfStatement",
      condition: this.transformExpression(
        arrow.body as Expression,
        false,
        declaration.loc?.startLine,
      ),
      thenBranch: [
        {
          kind: "ExpressionStatement",
          expression: {
            kind: "MethodInvocation",
            callee: targetRef,
            methodName: "Push",
            typeArguments: [],
            arguments: [itemExpr],
            loc: declaration.loc,
          },
          loc: declaration.loc,
        },
      ],
      elseIfBranches: [],
      loc: declaration.loc,
    });
    loop.forStatement.body = body;
    return [this.createListResultDeclaration(declaration), loop.idxDeclaration, loop.forStatement];
  }

  protected expandFindDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push(
      this.createIfAssignAndExit(
        this.transformExpression(arrow.body as Expression, false, declaration.loc?.startLine),
        targetRef,
        this.getLambdaItemReference(source, sourceInfo, arrow, loop.idxVar, 0),
        declaration.loc,
      ),
    );
    loop.forStatement.body = body;
    return [{ ...declaration, initializer: undefined }, loop.idxDeclaration, loop.forStatement];
  }

  protected expandFindIndexDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push(
      this.createIfAssignAndExit(
        this.transformExpression(arrow.body as Expression, false, declaration.loc?.startLine),
        targetRef,
        loop.idxVar,
        declaration.loc,
      ),
    );
    loop.forStatement.body = body;
    return [
      {
        ...declaration,
        initializer: { kind: "Literal", value: -1, loc: declaration.loc },
      },
      loop.idxDeclaration,
      loop.forStatement,
    ];
  }

  protected expandSomeDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push(
      this.createIfAssignAndExit(
        this.transformExpression(arrow.body as Expression, false, declaration.loc?.startLine),
        targetRef,
        { kind: "Literal", value: true, loc: declaration.loc },
        declaration.loc,
      ),
    );
    loop.forStatement.body = body;
    return [
      { ...declaration, initializer: { kind: "Literal", value: false, loc: declaration.loc } },
      loop.idxDeclaration,
      loop.forStatement,
    ];
  }

  protected expandEveryDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
  ): Statement[] {
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    body.push(
      this.createIfAssignAndExit(
        {
          kind: "UnaryExpression",
          operator: "Not",
          argument: this.transformExpression(
            arrow.body as Expression,
            false,
            declaration.loc?.startLine,
          ),
          loc: declaration.loc,
        },
        targetRef,
        { kind: "Literal", value: false, loc: declaration.loc },
        declaration.loc,
      ),
    );
    loop.forStatement.body = body;
    return [
      { ...declaration, initializer: { kind: "Literal", value: true, loc: declaration.loc } },
      loop.idxDeclaration,
      loop.forStatement,
    ];
  }

  protected expandReduceDeclaration(
    declaration: VariableDeclaration,
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
    initialValue: Expression | undefined,
  ): Statement[] {
    const loopStart = initialValue ? 0 : 1;
    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc, loopStart);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 1);
    const accumulatorParam = arrow.parameters[0];
    const nextValue = accumulatorParam
      ? this.replaceIdentifiers(
          arrow.body as Expression,
          new Map([[accumulatorParam.name.toLowerCase(), targetRef]]),
        )
      : (arrow.body as Expression);
    body.push({
      kind: "Assignment",
      target: targetRef,
      value: this.transformExpression(nextValue, false, declaration.loc?.startLine),
      loc: declaration.loc,
    });
    loop.forStatement.body = body;

    const initializer =
      initialValue ??
      this.createGetItemCall(
        source,
        { kind: "Literal", value: 0, loc: declaration.loc },
        declaration.loc,
      );
    return [
      {
        ...declaration,
        initializer: this.transformExpression(initializer, false, declaration.loc?.startLine),
      },
      loop.idxDeclaration,
      loop.forStatement,
    ];
  }

  protected expandArrayLiteralDeclaration(
    declaration: VariableDeclaration,
    literal: Extract<Expression, { kind: "ArrayLiteralExpression" }>,
  ): Statement[] {
    const type = declaration.type;
    if (!type) return [declaration];

    const listRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const statements: Statement[] = [
      {
        kind: "VariableDeclaration",
        name: declaration.name,
        type,
        initializer: {
          kind: "ObjectCreationExpression",
          type,
          arguments: [],
          loc: declaration.loc,
        },
        isConst: declaration.isConst,
        isArraySugar: declaration.isArraySugar,
        loc: declaration.loc,
        comment: declaration.comment,
      },
    ];

    for (const element of literal.elements) {
      if (element.kind === "SpreadExpression") {
        const functionalSpread = this.expandArrayLiteralFunctionalSpread(
          declaration,
          element,
          listRef,
        );
        if (functionalSpread) {
          statements.push(...functionalSpread);
          continue;
        }
      }

      const value =
        element.kind === "SpreadExpression"
          ? this.transformExpression(element.expression, false, declaration.loc?.startLine)
          : this.transformExpression(element, false, declaration.loc?.startLine);
      statements.push({
        kind: "ExpressionStatement",
        expression: {
          kind: "MethodInvocation",
          callee: listRef,
          methodName: "Push",
          typeArguments: [],
          arguments: [value],
          loc: element.loc ?? declaration.loc,
        },
        loc: element.loc ?? declaration.loc,
      });
    }

    return statements;
  }

  protected expandArrayLiteralFunctionalSpread(
    declaration: VariableDeclaration,
    spread: Extract<Expression, { kind: "SpreadExpression" }>,
    targetList: Identifier,
  ): Statement[] | undefined {
    const targetType = declaration.type;
    if (!targetType) return undefined;
    const expression = spread.expression;
    if (expression.kind !== "MethodInvocation" || !expression.callee) return undefined;

    const methodName = expression.methodName.toLowerCase();
    if (methodName !== "map" && methodName !== "filter") return undefined;

    const sourceInfo = this.getListExpressionInfo(expression.callee);
    if (!sourceInfo) return undefined;
    const arrow = expression.arguments[0];
    if (arrow?.kind !== "ArrowFunctionExpression" || Array.isArray(arrow.body)) return undefined;

    const tempName = this.freshSource();
    const tempDeclaration: VariableDeclaration = {
      kind: "VariableDeclaration",
      name: tempName,
      type: targetType,
      loc: spread.loc ?? declaration.loc,
    };
    this.rememberListVariable(tempName, targetType);

    const expanded =
      methodName === "map"
        ? this.expandMapDeclaration(tempDeclaration, expression.callee, sourceInfo, arrow)
        : this.expandFilterDeclaration(tempDeclaration, expression.callee, sourceInfo, arrow);

    return [
      ...expanded,
      {
        kind: "ExpressionStatement",
        expression: {
          kind: "MethodInvocation",
          callee: targetList,
          methodName: "Push",
          typeArguments: [],
          arguments: [{ kind: "Identifier", name: tempName, loc: spread.loc ?? declaration.loc }],
          loc: spread.loc ?? declaration.loc,
        },
        loc: spread.loc ?? declaration.loc,
      },
    ];
  }

  protected isTTListType(type: TypeReference | undefined): boolean {
    if (!type) return false;
    const name = type.name.toLowerCase();
    return name === "ttlist" || name.startsWith("ttlist_");
  }

  protected createFunctionalLoop(
    source: Expression,
    _sourceInfo: ListVariableInfo,
    _arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
    loc: Node["loc"],
    startIndex = 0,
  ): {
    idxDeclaration: VariableDeclaration;
    idxVar: Identifier;
    forStatement: Extract<Statement, { kind: "ForStatement" }>;
  } {
    const idxName = this.freshIndex();
    const idxVar: Identifier = { kind: "Identifier", name: idxName, loc };
    const idxDeclaration: VariableDeclaration = {
      kind: "VariableDeclaration",
      name: idxName,
      type: { kind: "TypeReference", name: "Integer", typeArguments: [], loc },
      loc,
    };
    const forStatement: Extract<Statement, { kind: "ForStatement" }> = {
      kind: "ForStatement",
      counter: idxVar,
      start: { kind: "Literal", value: startIndex, loc },
      end: {
        kind: "BinaryExpression",
        left: { kind: "MemberAccess", target: source, member: "Length", loc },
        operator: "-",
        right: { kind: "Literal", value: 1, loc },
        loc,
      },
      body: [],
      loc,
    };
    return { idxDeclaration, idxVar, forStatement };
  }

  protected createLambdaParameterDeclarations(
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
    idxVar: Identifier,
    itemParamOffset: number,
  ): Statement[] {
    const statements: Statement[] = [];
    const itemParam = arrow.parameters[itemParamOffset];
    if (itemParam) {
      statements.push({
        kind: "VariableDeclaration",
        name: itemParam.name,
        type: this.resolveLambdaItemType(itemParam, sourceInfo),
        initializer: this.createGetItemCall(source, idxVar, itemParam.loc ?? arrow.loc),
        loc: itemParam.loc ?? arrow.loc,
      });
    }
    const indexParam = arrow.parameters[itemParamOffset + 1];
    if (indexParam) {
      statements.push({
        kind: "VariableDeclaration",
        name: indexParam.name,
        type: { kind: "TypeReference", name: "Integer", typeArguments: [], loc: indexParam.loc },
        initializer: idxVar,
        loc: indexParam.loc ?? arrow.loc,
      });
    }
    return statements;
  }

  protected resolveLambdaItemType(
    param: ParameterDeclaration,
    sourceInfo: ListVariableInfo,
  ): TypeReference {
    if (param.type.name.toLowerCase() !== "variant") return param.type;
    return sourceInfo.elementType ?? param.type;
  }

  protected getLambdaItemReference(
    source: Expression,
    sourceInfo: ListVariableInfo,
    arrow: Extract<Expression, { kind: "ArrowFunctionExpression" }>,
    idxVar: Identifier,
    itemParamOffset: number,
  ): Expression {
    const itemParam = arrow.parameters[itemParamOffset];
    if (itemParam) {
      return { kind: "Identifier", name: itemParam.name, loc: itemParam.loc ?? arrow.loc };
    }
    void sourceInfo;
    return this.createGetItemCall(source, idxVar, arrow.loc);
  }

  protected createGetItemCall(
    source: Expression,
    index: Expression,
    loc: Node["loc"],
  ): MethodInvocation {
    return {
      kind: "MethodInvocation",
      callee: source,
      methodName: "GetItem",
      typeArguments: [],
      arguments: [index],
      loc,
    };
  }

  protected createListResultDeclaration(declaration: VariableDeclaration): VariableDeclaration {
    return {
      ...declaration,
      initializer: declaration.type
        ? {
            kind: "ObjectCreationExpression",
            type: declaration.type,
            arguments: [],
            loc: declaration.loc,
          }
        : undefined,
    };
  }

  protected createIfAssignAndExit(
    condition: Expression,
    target: Expression,
    value: Expression,
    loc: Node["loc"],
  ): Extract<Statement, { kind: "IfStatement" }> {
    return {
      kind: "IfStatement",
      condition,
      thenBranch: [
        { kind: "Assignment", target, value, loc },
        { kind: "ExitStatement", target: "For", loc },
      ],
      elseIfBranches: [],
      loc,
    };
  }

  protected getListExpressionInfo(expr: Expression): ListVariableInfo | undefined {
    if (expr.kind !== "Identifier") return undefined;
    const name = expr.name.toLowerCase();
    for (let i = this.listVariableScopes.length - 1; i >= 0; i--) {
      const info = this.listVariableScopes[i]?.get(name);
      if (info) return info;
    }
    return undefined;
  }

  protected isListExpression(expr: Expression): boolean {
    return this.getListExpressionInfo(expr) !== undefined;
  }

  protected rememberListVariable(name: string, type: TypeReference): void {
    this.listVariableScopes[this.listVariableScopes.length - 1]?.set(name.toLowerCase(), {
      type,
      elementType: this.extractTTListElementType(type),
    });
  }

  protected extractTTListElementType(type: TypeReference): TypeReference | undefined {
    if (type.name.toLowerCase() === "ttlist") return type.typeArguments[0];
    const match = /^TTList_(.+)$/i.exec(type.name);
    if (!match?.[1]) return undefined;
    return { kind: "TypeReference", name: match[1], typeArguments: [], loc: type.loc };
  }

  protected replaceIdentifiers(
    expr: Expression,
    replacements: ReadonlyMap<string, Expression>,
  ): Expression {
    const cloned = deepClone(expr);
    const visit = (node: Expression): Expression => {
      switch (node.kind) {
        case "Identifier": {
          const replacement = replacements.get(node.name.toLowerCase());
          return replacement ? deepClone(replacement) : node;
        }
        case "ObjectCreationExpression":
          node.arguments = node.arguments.map(visit);
          return node;
        case "MethodInvocation":
          if (node.callee) node.callee = visit(node.callee);
          node.arguments = node.arguments.map(visit);
          return node;
        case "MemberAccess":
          node.target = visit(node.target);
          return node;
        case "ArrayAccessExpression":
          node.target = visit(node.target);
          node.index = visit(node.index);
          return node;
        case "BinaryExpression":
          node.left = visit(node.left);
          node.right = visit(node.right);
          return node;
        case "UnaryExpression":
          node.argument = visit(node.argument);
          return node;
        case "TernaryExpression":
          node.condition = visit(node.condition);
          node.trueExpr = visit(node.trueExpr);
          node.falseExpr = visit(node.falseExpr);
          return node;
        case "NullCoalescingExpression":
          node.left = visit(node.left);
          node.right = visit(node.right);
          return node;
        case "OptionalChainingExpression":
          node.target = visit(node.target);
          node.member = visit(node.member);
          return node;
        case "PipeExpression":
          node.left = visit(node.left);
          node.right = visit(node.right);
          return node;
        case "ObjectInitializerExpression":
          node.arguments = node.arguments.map(visit);
          node.assignments = node.assignments.map((assignment) => ({
            ...assignment,
            value: visit(assignment.value),
          }));
          return node;
        case "ArrayLiteralExpression":
          node.elements = node.elements.map((element) => {
            if (element.kind === "SpreadExpression") {
              element.expression = visit(element.expression);
              return element;
            }
            return visit(element);
          });
          return node;
        case "SpreadExpression":
          node.expression = visit(node.expression);
          return node;
        case "ArrowFunctionExpression":
        case "TaggedTemplateExpression":
        case "TypeReferenceExpression":
        case "Literal":
          return node;
      }
    };
    return visit(cloned);
  }
}
