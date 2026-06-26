import type {
  ClassMember,
  Expression,
  MethodInvocation,
  Node,
  Statement,
  TopLevelMember,
} from "../../../ast/ast";
export class LoggerPrintSugarTransformer {
  public readonly usedSugars = new Set<string>();
  private usedLoggerPrint = false;

  public transform(unit: { members: TopLevelMember[]; loc?: Node["loc"] }): void {
    unit.members = unit.members.map((member) => this.transformTopLevelMember(member));
    if (this.usedLoggerPrint) {
      this.usedSugars.add("logger-print");
    }
  }

  private transformTopLevelMember(member: TopLevelMember): TopLevelMember {
    switch (member.kind) {
      case "ImportsDeclaration":
      case "DelegateDeclaration":
      case "EnumDeclaration":
      case "OpaqueStatement":
      case "FieldDeclaration":
        if (member.kind === "FieldDeclaration" && member.initializer) {
          member.initializer = this.transformExpression(member.initializer);
        }
        return member;
      case "NamespaceDeclaration":
        member.members = member.members.map((m) => this.transformTopLevelMember(m));
        return member;
      case "ClassDeclaration":
        member.members = member.members.map((m) => this.transformClassMember(m));
        return member;
      case "MethodDeclaration":
        this.transformMethod(member);
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
        return this.transformStatement(member);
    }
  }

  private transformClassMember(member: ClassMember): ClassMember {
    switch (member.kind) {
      case "MethodDeclaration":
        this.transformMethod(member);
        return member;
      case "FieldDeclaration":
        if (member.initializer) member.initializer = this.transformExpression(member.initializer);
        return member;
      case "PropertyDeclaration":
        if (member.getter) this.transformMethod(member.getter);
        if (member.setter) this.transformMethod(member.setter);
        return member;
      case "ClassDeclaration":
        member.members = member.members.map((m) => this.transformClassMember(m));
        return member;
    }
  }

  private transformMethod(
    method: Extract<TopLevelMember | ClassMember, { kind: "MethodDeclaration" }>,
  ): void {
    method.body = method.body.map((statement) => this.transformStatement(statement));
  }

  private transformStatements(statements: Statement[]): Statement[] {
    return statements.map((statement) => this.transformStatement(statement));
  }

  private transformStatement(statement: Statement): Statement {
    switch (statement.kind) {
      case "VariableDeclaration":
        if (statement.initializer) {
          statement.initializer = this.transformExpression(statement.initializer);
        }
        return statement;
      case "DestructuredVariableDeclaration":
        statement.initializer = this.transformExpression(statement.initializer);
        return statement;
      case "ExpressionStatement":
        statement.expression = this.transformExpression(statement.expression);
        return statement;
      case "Assignment":
        statement.target = this.transformExpression(statement.target);
        statement.value = this.transformExpression(statement.value);
        return statement;
      case "IfStatement":
        statement.condition = this.transformExpression(statement.condition);
        statement.thenBranch = this.transformStatements(statement.thenBranch);
        for (const branch of statement.elseIfBranches) {
          branch.condition = this.transformExpression(branch.condition);
          branch.body = this.transformStatements(branch.body);
        }
        if (statement.elseBranch) {
          statement.elseBranch = this.transformStatements(statement.elseBranch);
        }
        return statement;
      case "ForStatement":
        statement.start = this.transformExpression(statement.start);
        statement.end = this.transformExpression(statement.end);
        if (statement.step) statement.step = this.transformExpression(statement.step);
        statement.body = this.transformStatements(statement.body);
        return statement;
      case "ForEachStatement":
        statement.enumerable = this.transformExpression(statement.enumerable);
        statement.body = this.transformStatements(statement.body);
        return statement;
      case "WhileStatement":
        statement.condition = this.transformExpression(statement.condition);
        statement.body = this.transformStatements(statement.body);
        return statement;
      case "TryCatchStatement":
        statement.tryBody = this.transformStatements(statement.tryBody);
        statement.catchBody = this.transformStatements(statement.catchBody);
        if (statement.finallyBody) {
          statement.finallyBody = this.transformStatements(statement.finallyBody);
        }
        return statement;
      case "UsingStatement":
        statement.resourceArgs = statement.resourceArgs.map((arg) => this.transformExpression(arg));
        statement.body = this.transformStatements(statement.body);
        return statement;
      case "ReturnStatement":
        if (statement.expression) {
          statement.expression = this.transformExpression(statement.expression);
        }
        return statement;
      case "ThrowStatement":
        statement.expression = this.transformExpression(statement.expression);
        return statement;
      case "Block":
        statement.statements = this.transformStatements(statement.statements);
        return statement;
      case "WithStatement":
        statement.expression = this.transformExpression(statement.expression);
        statement.body = this.transformStatements(statement.body);
        return statement;
      case "SelectCaseStatement":
        statement.expression = this.transformExpression(statement.expression);
        for (const branch of statement.cases) {
          branch.values = branch.values.map((value) => this.transformExpression(value));
          branch.body = this.transformStatements(branch.body);
        }
        return statement;
      case "EnumDeclaration":
      case "ExitStatement":
      case "ContinueStatement":
      case "OpaqueStatement":
        return statement;
    }
  }

  private transformExpression(expression: Expression): Expression {
    switch (expression.kind) {
      case "MethodInvocation": {
        if (expression.callee) {
          expression.callee = this.transformExpression(expression.callee);
        }
        expression.arguments = expression.arguments.map((arg) => this.transformExpression(arg));
        return this.rewritePrintExpression(expression);
      }
      case "ObjectCreationExpression":
        expression.arguments = expression.arguments.map((arg) => this.transformExpression(arg));
        return expression;
      case "MemberAccess":
        expression.target = this.transformExpression(expression.target);
        return expression;
      case "ArrayAccessExpression":
        expression.target = this.transformExpression(expression.target);
        expression.index = this.transformExpression(expression.index);
        return expression;
      case "BinaryExpression":
        expression.left = this.transformExpression(expression.left);
        expression.right = this.transformExpression(expression.right);
        return expression;
      case "UnaryExpression":
        expression.argument = this.transformExpression(expression.argument);
        return expression;
      case "TernaryExpression":
        expression.condition = this.transformExpression(expression.condition);
        expression.trueExpr = this.transformExpression(expression.trueExpr);
        expression.falseExpr = this.transformExpression(expression.falseExpr);
        return expression;
      case "NullCoalescingExpression":
        expression.left = this.transformExpression(expression.left);
        expression.right = this.transformExpression(expression.right);
        return expression;
      case "OptionalChainingExpression":
        expression.target = this.transformExpression(expression.target);
        expression.member = this.transformExpression(expression.member);
        return expression;
      case "PipeExpression":
        expression.left = this.transformExpression(expression.left);
        expression.right = this.transformExpression(expression.right);
        return expression;
      case "ObjectInitializerExpression":
        expression.arguments = expression.arguments.map((arg) => this.transformExpression(arg));
        expression.assignments = expression.assignments.map((assignment) => ({
          ...assignment,
          value: this.transformExpression(assignment.value),
        }));
        return expression;
      case "ArrayLiteralExpression":
        expression.elements = expression.elements.map((element) =>
          this.transformExpression(element),
        );
        return expression;
      case "SpreadExpression":
        expression.expression = this.transformExpression(expression.expression);
        return expression;
      case "ArrowFunctionExpression":
        if (Array.isArray(expression.body)) {
          return {
            ...expression,
            body: this.transformStatements(expression.body),
          };
        } else {
          return {
            ...expression,
            body: this.transformExpression(expression.body),
          };
        }
      case "TaggedTemplateExpression":
      case "TypeReferenceExpression":
      case "Identifier":
      case "Literal":
        return expression;
    }
  }

  private rewritePrintExpression(expression: MethodInvocation): Expression {
    if (expression.callee !== undefined || expression.methodName.toLowerCase() !== "print") {
      return expression;
    }

    this.usedLoggerPrint = true;
    return {
      ...expression,
      callee: {
        kind: "Identifier",
        name: "mod_logger",
        loc: expression.loc,
      },
      methodName: "Printe",
      noParentheses: false,
    };
  }

  private injectImport(members: TopLevelMember[], target: string, loc: Node["loc"]): void {
    const alreadyImported = members.some(
      (member) =>
        member.kind === "ImportsDeclaration" &&
        member.target.toLowerCase() === target.toLowerCase(),
    );
    if (alreadyImported) return;

    let insertIdx = 0;
    for (let i = 0; i < members.length; i++) {
      if (members[i]?.kind === "ImportsDeclaration") {
        insertIdx = i + 1;
      }
    }
    members.splice(insertIdx, 0, {
      kind: "ImportsDeclaration",
      target,
      loc,
    });
  }
}
