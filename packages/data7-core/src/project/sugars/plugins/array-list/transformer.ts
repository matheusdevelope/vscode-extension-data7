import { deepClone } from "../../../ast/clone";
import {
  ASTWalker,
  type Expression,
  type ExpressionStatement,
  type Identifier,
  type MemberAccess,
  type MethodInvocation,
  type Node,
  type ParameterDeclaration,
  type ReturnStatement,
  type Statement,
  type TypeReference,
  type VariableDeclaration,
} from "../../../ast/ast";
interface ListVariableInfo {
  readonly type: TypeReference;
  readonly elementType?: TypeReference;
}

type ArrowFunctionExpression = Extract<Expression, { kind: "ArrowFunctionExpression" }>;

/**
 * Owns lowering of TTList<T>, collection literals, spreads and functional
 * collection operations. The AST transformer supplies traversal and context.
 */
export abstract class ArrayListSugarTransformer extends ASTWalker {
  protected abstract readonly usedSugars: Set<string>;
  protected readonly listVariableScopes: Map<string, ListVariableInfo>[] = [
    new Map<string, ListVariableInfo>(),
  ];
  private readonly lambdaParameterReplacements = new WeakMap<
    ArrowFunctionExpression,
    Map<string, Expression>
  >();

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

    this.usedSugars.add("array-list");

    switch (methodName) {
      case "map":
        if (!declaration.type || !this.isListContainerType(declaration.type)) {
          return undefined;
        }
        this.rememberListVariable(declaration.name, declaration.type);
        return this.expandMapDeclaration(declaration, call.callee, sourceInfo, arrow);
      case "filter":
        if (!declaration.type || !this.isListContainerType(declaration.type)) {
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

  protected expandFunctionalListReturn(
    statement: ReturnStatement,
    targetType: TypeReference | undefined,
  ): Statement[] | undefined {
    if (!this.isSugarEnabled("array-list")) return undefined;
    if (!targetType || statement.expression?.kind !== "MethodInvocation") return undefined;

    const tempName = this.freshSource();
    const tempDeclaration: VariableDeclaration = {
      kind: "VariableDeclaration",
      name: tempName,
      type: targetType,
      initializer: statement.expression,
      loc: statement.loc,
    };
    const expanded = this.expandFunctionalListDeclaration(tempDeclaration);
    if (!expanded) return undefined;

    return [
      ...expanded,
      {
        kind: "ReturnStatement",
        expression: { kind: "Identifier", name: tempName, loc: statement.loc },
        loc: statement.loc,
      },
    ];
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
      body.push(...this.transformStatements(this.rewriteLambdaStatements(arrow, arrow.body)));
    } else {
      body.push({
        kind: "ExpressionStatement",
        expression: this.transformExpression(
          this.rewriteLambdaExpression(arrow, arrow.body),
          true,
          statement.loc?.startLine,
        ),
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
    arrow: ArrowFunctionExpression,
  ): Statement[] | undefined {
    const returnBody = this.getArrowReturnBody(arrow);
    if (!returnBody) return undefined;

    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    if (returnBody.prefix.length > 0) {
      body.push(
        ...this.transformStatements(this.rewriteLambdaStatements(arrow, returnBody.prefix)),
      );
    }
    body.push({
      kind: "ExpressionStatement",
      expression: {
        kind: "MethodInvocation",
        callee: targetRef,
        methodName: "Push",
        typeArguments: [],
        arguments: [
          this.transformExpression(
            this.rewriteLambdaExpression(arrow, returnBody.expression),
            false,
            declaration.loc?.startLine,
          ),
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
    arrow: ArrowFunctionExpression,
  ): Statement[] | undefined {
    const returnBody = this.getArrowReturnBody(arrow);
    if (!returnBody) return undefined;

    const loop = this.createFunctionalLoop(source, sourceInfo, arrow, declaration.loc);
    const targetRef: Identifier = {
      kind: "Identifier",
      name: declaration.name,
      loc: declaration.loc,
    };
    const body = this.createLambdaParameterDeclarations(source, sourceInfo, arrow, loop.idxVar, 0);
    const itemExpr = this.getLambdaItemReference(source, sourceInfo, arrow, loop.idxVar, 0);
    if (returnBody.prefix.length > 0) {
      body.push(
        ...this.transformStatements(this.rewriteLambdaStatements(arrow, returnBody.prefix)),
      );
    }
    body.push({
      kind: "IfStatement",
      condition: this.transformExpression(
        this.rewriteLambdaExpression(arrow, returnBody.expression),
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
    arrow: ArrowFunctionExpression,
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
        this.transformExpression(
          this.rewriteLambdaExpression(arrow, arrow.body as Expression),
          false,
          declaration.loc?.startLine,
        ),
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
    arrow: ArrowFunctionExpression,
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
        this.transformExpression(
          this.rewriteLambdaExpression(arrow, arrow.body as Expression),
          false,
          declaration.loc?.startLine,
        ),
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
    arrow: ArrowFunctionExpression,
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
        this.transformExpression(
          this.rewriteLambdaExpression(arrow, arrow.body as Expression),
          false,
          declaration.loc?.startLine,
        ),
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
    arrow: ArrowFunctionExpression,
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
            this.rewriteLambdaExpression(arrow, arrow.body as Expression),
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
    arrow: ArrowFunctionExpression,
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
          this.rewriteLambdaExpression(arrow, arrow.body as Expression),
          new Map([[accumulatorParam.name.toLowerCase(), targetRef]]),
        )
      : this.rewriteLambdaExpression(arrow, arrow.body as Expression);
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
    statements.push(...this.createArrayLiteralPushStatements(listRef, literal, declaration));
    return statements;
  }

  /**
   * `list = []` / `list = [a, b]` on a TTList/array-sugar target →
   * `list = New TTList_T()` + optional `list.Push(...)` per element.
   */
  protected expandArrayLiteralAssignment(
    target: Expression,
    listType: TypeReference,
    literal: Extract<Expression, { kind: "ArrayLiteralExpression" }>,
    loc: Node["loc"],
    comment?: string,
  ): Statement[] {
    const statements: Statement[] = [
      {
        kind: "Assignment",
        target,
        value: {
          kind: "ObjectCreationExpression",
          type: listType,
          arguments: [],
          loc,
        },
        loc,
        comment,
      },
    ];
    statements.push(
      ...this.createArrayLiteralPushStatements(target, literal, {
        kind: "VariableDeclaration",
        name: "",
        type: listType,
        loc,
      }),
    );
    return statements;
  }

  private createArrayLiteralPushStatements(
    listTarget: Expression,
    literal: Extract<Expression, { kind: "ArrayLiteralExpression" }>,
    declaration: VariableDeclaration,
  ): Statement[] {
    const statements: Statement[] = [];
    for (const element of literal.elements) {
      if (element.kind === "SpreadExpression") {
        const functionalSpread =
          listTarget.kind === "Identifier"
            ? this.expandArrayLiteralFunctionalSpread(declaration, element, listTarget)
            : undefined;
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
          callee: listTarget,
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

  /** Resolves the TTList/array-sugar type of an assignment target, if any. */
  protected resolveAssignmentListType(_target: Expression): TypeReference | undefined {
    return undefined;
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
    if (!expanded) return undefined;

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

  /** `TTList<T>` / `TTList_Foo`, or a user subclass such as `Pessoas` extending `TTList<Pessoa>`. */
  protected isListContainerType(type: TypeReference | undefined): boolean {
    if (this.isTTListType(type)) return true;
    if (!type || type.typeArguments.length > 0) return false;
    return this.resolveListElementTypeName(type.name) !== undefined;
  }

  protected resolveListElementTypeName(_typeName: string): string | undefined {
    return undefined;
  }

  protected extractListElementType(type: TypeReference): TypeReference | undefined {
    return this.extractTTListElementType(type);
  }

  protected createFunctionalLoop(
    source: Expression,
    _sourceInfo: ListVariableInfo,
    _arrow: ArrowFunctionExpression,
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
    arrow: ArrowFunctionExpression,
    idxVar: Identifier,
    itemParamOffset: number,
  ): Statement[] {
    const statements: Statement[] = [];
    const replacements = new Map<string, Expression>();
    const itemParam = arrow.parameters[itemParamOffset];
    if (itemParam) {
      const itemName = this.freshSource();
      replacements.set(itemParam.name.toLowerCase(), {
        kind: "Identifier",
        name: itemName,
        loc: itemParam.loc ?? arrow.loc,
      });
      statements.push({
        kind: "VariableDeclaration",
        name: itemName,
        type: this.resolveLambdaItemType(itemParam, sourceInfo),
        initializer: this.createGetItemCall(source, idxVar, itemParam.loc ?? arrow.loc),
        loc: itemParam.loc ?? arrow.loc,
      });
    }
    const indexParam = arrow.parameters[itemParamOffset + 1];
    if (indexParam) {
      const indexName = this.freshSource();
      replacements.set(indexParam.name.toLowerCase(), {
        kind: "Identifier",
        name: indexName,
        loc: indexParam.loc ?? arrow.loc,
      });
      statements.push({
        kind: "VariableDeclaration",
        name: indexName,
        type: { kind: "TypeReference", name: "Integer", typeArguments: [], loc: indexParam.loc },
        initializer: idxVar,
        loc: indexParam.loc ?? arrow.loc,
      });
    }
    this.lambdaParameterReplacements.set(arrow, replacements);
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
    arrow: ArrowFunctionExpression,
    idxVar: Identifier,
    itemParamOffset: number,
  ): Expression {
    const itemParam = arrow.parameters[itemParamOffset];
    if (itemParam) {
      const replacement = this.lambdaParameterReplacements
        .get(arrow)
        ?.get(itemParam.name.toLowerCase());
      if (replacement) return deepClone(replacement);
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

  private getArrowReturnBody(
    arrow: ArrowFunctionExpression,
  ): { readonly prefix: Statement[]; readonly expression: Expression } | undefined {
    if (!Array.isArray(arrow.body)) {
      return { prefix: [], expression: arrow.body };
    }

    const lastStatement = arrow.body[arrow.body.length - 1];
    if (lastStatement?.kind !== "ReturnStatement" || !lastStatement.expression) {
      return undefined;
    }

    return {
      prefix: arrow.body.slice(0, -1),
      expression: lastStatement.expression,
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
    if (expr.kind === "Identifier") {
      return this.getListExpressionInfo(expr) !== undefined;
    }
    if (expr.kind === "MemberAccess") {
      return this.isListFieldOrPropertyAccess(expr);
    }
    return false;
  }

  /**
   * True when `receiver.member` is a field/property whose type is a list
   * container (`TTList` / array-sugar). Must not treat methods that return a
   * list as indexable members (`factory.CreateList(i)` stays a call).
   */
  protected isListFieldOrPropertyAccess(_expr: MemberAccess): boolean {
    return false;
  }

  /**
   * VB-style `list(i)` parses as a bare MethodInvocation (methodName = list,
   * one argument). `receiver.listField(i)` parses with a callee. When the
   * receiver binding / member is a known TTList/array-sugar list, that is an
   * indexer read/write, not a call — rewrite to GetItem/SetItem.
   */
  protected getListParenIndexAccess(
    expression: Expression,
  ): { readonly target: Expression; readonly index: Expression } | undefined {
    if (expression.kind !== "MethodInvocation") return undefined;
    if (expression.typeArguments.length > 0) return undefined;
    if (expression.arguments.length !== 1) return undefined;
    const index = expression.arguments[0];
    if (!index) return undefined;

    if (expression.callee === undefined) {
      const target: Identifier = {
        kind: "Identifier",
        name: expression.methodName,
        loc: expression.loc,
      };
      if (!this.isListExpression(target)) return undefined;
      return { target, index };
    }

    const target: MemberAccess = {
      kind: "MemberAccess",
      target: expression.callee,
      member: expression.methodName,
      loc: expression.loc,
    };
    if (!this.isListFieldOrPropertyAccess(target)) return undefined;
    return { target, index };
  }

  protected rememberListVariable(name: string, type: TypeReference): void {
    this.listVariableScopes[this.listVariableScopes.length - 1]?.set(name.toLowerCase(), {
      type,
      elementType: this.extractListElementType(type),
    });
  }

  protected rememberListParameters(parameters: readonly ParameterDeclaration[]): void {
    for (const parameter of parameters) {
      if (this.isListContainerType(parameter.type)) {
        this.rememberListVariable(parameter.name, parameter.type);
      }
    }
  }

  protected markArrayListSugarFromParameters(
    parameters: readonly { readonly isArraySugar?: boolean }[],
  ): void {
    if (parameters.some((parameter) => parameter.isArraySugar === true)) {
      this.usedSugars.add("array-list");
    }
  }

  protected extractTTListElementType(type: TypeReference): TypeReference | undefined {
    if (type.name.toLowerCase() === "ttlist") return type.typeArguments[0];
    const match = /^TTList_(.+)$/i.exec(type.name);
    if (!match?.[1]) return undefined;
    return { kind: "TypeReference", name: match[1], typeArguments: [], loc: type.loc };
  }

  protected rewriteLambdaExpression(
    arrow: ArrowFunctionExpression,
    expression: Expression,
  ): Expression {
    const replacements = this.lambdaParameterReplacements.get(arrow);
    if (!replacements || replacements.size === 0) return expression;
    return this.replaceIdentifiers(expression, replacements);
  }

  protected rewriteLambdaStatements(
    arrow: ArrowFunctionExpression,
    statements: readonly Statement[],
  ): Statement[] {
    const replacements = this.lambdaParameterReplacements.get(arrow);
    if (!replacements || replacements.size === 0) return [...statements];
    return statements.map((statement) =>
      this.replaceIdentifiersInStatement(statement, replacements),
    );
  }

  protected replaceIdentifiersInStatement(
    statement: Statement,
    replacements: ReadonlyMap<string, Expression>,
  ): Statement {
    const cloned = deepClone(statement);
    const visitExpression = (expr: Expression): Expression =>
      this.replaceIdentifiers(expr, replacements);
    const visitStatements = (statements: Statement[]): Statement[] =>
      statements.map((s) => this.replaceIdentifiersInStatement(s, replacements));

    switch (cloned.kind) {
      case "ExpressionStatement":
        cloned.expression = visitExpression(cloned.expression);
        return cloned;
      case "Assignment":
        cloned.target = visitExpression(cloned.target);
        cloned.value = visitExpression(cloned.value);
        return cloned;
      case "VariableDeclaration":
        if (cloned.initializer) cloned.initializer = visitExpression(cloned.initializer);
        return cloned;
      case "IfStatement":
        cloned.condition = visitExpression(cloned.condition);
        cloned.thenBranch = visitStatements(cloned.thenBranch);
        cloned.elseIfBranches = cloned.elseIfBranches.map((branch) => ({
          ...branch,
          condition: visitExpression(branch.condition),
          body: visitStatements(branch.body),
        }));
        if (cloned.elseBranch) cloned.elseBranch = visitStatements(cloned.elseBranch);
        return cloned;
      case "ForStatement":
        cloned.start = visitExpression(cloned.start);
        cloned.end = visitExpression(cloned.end);
        if (cloned.step) cloned.step = visitExpression(cloned.step);
        cloned.body = visitStatements(cloned.body);
        return cloned;
      case "ForEachStatement":
        cloned.enumerable = visitExpression(cloned.enumerable);
        cloned.body = visitStatements(cloned.body);
        return cloned;
      case "WhileStatement":
        cloned.condition = visitExpression(cloned.condition);
        cloned.body = visitStatements(cloned.body);
        return cloned;
      case "TryCatchStatement":
        cloned.tryBody = visitStatements(cloned.tryBody);
        cloned.catchBody = visitStatements(cloned.catchBody);
        if (cloned.finallyBody) cloned.finallyBody = visitStatements(cloned.finallyBody);
        return cloned;
      case "UsingStatement":
        cloned.resourceArgs = cloned.resourceArgs.map(visitExpression);
        cloned.body = visitStatements(cloned.body);
        return cloned;
      case "ReturnStatement":
        if (cloned.expression) cloned.expression = visitExpression(cloned.expression);
        return cloned;
      case "ThrowStatement":
        cloned.expression = visitExpression(cloned.expression);
        return cloned;
      case "Block":
        cloned.statements = visitStatements(cloned.statements);
        return cloned;
      case "WithStatement":
        cloned.expression = visitExpression(cloned.expression);
        cloned.body = visitStatements(cloned.body);
        return cloned;
      case "SelectCaseStatement":
        cloned.expression = visitExpression(cloned.expression);
        cloned.cases = cloned.cases.map((branch) => ({
          ...branch,
          values: branch.values.map(visitExpression),
          body: visitStatements(branch.body),
        }));
        return cloned;
      case "DestructuredVariableDeclaration":
        cloned.initializer = visitExpression(cloned.initializer);
        cloned.bindings = cloned.bindings.map((binding) => ({
          ...binding,
          defaultValue: binding.defaultValue ? visitExpression(binding.defaultValue) : undefined,
        }));
        return cloned;
      case "OpaqueStatement":
      case "ExitStatement":
      case "ContinueStatement":
      case "EnumDeclaration":
        return cloned;
    }
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
