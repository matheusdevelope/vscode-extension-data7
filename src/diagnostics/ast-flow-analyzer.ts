import * as vscode from "vscode";
import {
  DiagnosticCodes,
  setDiagnosticPayload,
  type DeadCodePayload,
  type RedundantTerminalExitPayload,
} from "./diagnostic-codes";
import { typeRefToString } from "./diagnostic-helpers";
import {
  ASTWalker,
  type Assignment,
  type Expression,
  type MethodDeclaration,
  type Node,
  type Statement,
} from "../project/ast/ast";

interface FlowState {
  reachable: boolean;
  retValSet: boolean;
  nullFacts: Map<string, "null" | "non-null">;
}

const STATIC_NON_NULL = Symbol("static-non-null");
type StaticValue = string | number | boolean | null | typeof STATIC_NON_NULL;

/** Performs conservative reachability, return-value, and null-fact analysis for one method. */
export class ASTFlowAnalyzer {
  private readonly isFunction: boolean;
  private readonly reachableNodes = new Set<Node>();
  private readonly deadCodeCoveredLines = new Set<number>();
  private hasMissingReturnPath = false;

  constructor(
    private readonly methodNode: MethodDeclaration,
    private readonly lines: readonly string[],
    private readonly diagnostics: vscode.Diagnostic[],
  ) {
    this.isFunction =
      methodNode.returnType !== undefined &&
      typeRefToString(methodNode.returnType)?.toLowerCase() !== "void";
  }

  public run(): void {
    this.checkStatements(
      this.methodNode.body,
      {
        reachable: true,
        retValSet: false,
        nullFacts: new Map(),
      },
      true,
    );
    this.collectUnreachableStatements();
    if (this.isFunction && this.hasMissingReturnPath && this.methodNode.loc) {
      this.pushMissingReturnDiagnostic();
    }
  }

  private collectUnreachableStatements(): void {
    const walker = new (class extends ASTWalker {
      constructor(private readonly analyzer: ASTFlowAnalyzer) {
        super();
      }

      public override walk(node: Node): void {
        if (this.analyzer.isUnreachableStatement(node)) {
          this.analyzer.pushDeadCodeDiagnostic(node);
          return;
        }
        super.walk(node);
      }
    })(this);
    for (const statement of this.methodNode.body) walker.walk(statement);
  }

  private isUnreachableStatement(node: Node): boolean {
    if (node.kind === "OpaqueStatement" && isCommentOnlyOpaqueStatement(node.text)) {
      return false;
    }
    if (node.loc && this.isLineCoveredByDeadCodeBlock(node.loc.startLine - 1)) {
      return false;
    }
    const statementKinds = new Set([
      "ExpressionStatement",
      "Assignment",
      "VariableDeclaration",
      "OpaqueStatement",
      "IfStatement",
      "ForStatement",
      "ForEachStatement",
      "WhileStatement",
      "TryCatchStatement",
      "UsingStatement",
      "ReturnStatement",
      "ExitStatement",
      "ContinueStatement",
      "ThrowStatement",
      "Block",
      "WithStatement",
      "SelectCaseStatement",
    ]);
    return statementKinds.has(node.kind) && !this.reachableNodes.has(node) && !!node.loc;
  }

  private pushDeadCodeDiagnostic(node: Node): void {
    if (!node.loc) return;
    const lineIndex = node.loc.startLine - 1;
    const line = this.lines[lineIndex] ?? "";
    const range = new vscode.Range(
      lineIndex,
      line.length - line.trimStart().length,
      lineIndex,
      line.trimEnd().length,
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      "Código inalcançável detectado (dead-code).",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = DiagnosticCodes.DeadCode;
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    const payload: DeadCodePayload = {
      code: DiagnosticCodes.DeadCode,
      startLine: lineIndex,
      endLine: lineIndex,
    };
    setDiagnosticPayload(diagnostic, payload);
    this.diagnostics.push(diagnostic);
  }

  private pushDeadCodeBlockDiagnostic(statements: readonly Statement[]): void {
    const locs = statements
      .map((statement) => statement.loc)
      .filter((loc): loc is NonNullable<Statement["loc"]> => loc !== undefined);
    if (locs.length === 0) return;

    const startLine = Math.min(...locs.map((loc) => loc.startLine)) - 1;
    const endLine = Math.max(...locs.map((loc) => loc.endLine)) - 1;
    const startText = this.lines[startLine] ?? "";
    const endText = this.lines[endLine] ?? "";
    const range = new vscode.Range(
      startLine,
      startText.length - startText.trimStart().length,
      endLine,
      endText.trimEnd().length,
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      "Bloco de código inalcançável detectado (dead-code).",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = DiagnosticCodes.DeadCode;
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    const payload: DeadCodePayload = {
      code: DiagnosticCodes.DeadCode,
      startLine,
      endLine,
    };
    for (let line = startLine; line <= endLine; line++) {
      this.deadCodeCoveredLines.add(line);
    }
    setDiagnosticPayload(diagnostic, payload);
    this.diagnostics.push(diagnostic);
  }

  private isLineCoveredByDeadCodeBlock(line: number): boolean {
    return this.deadCodeCoveredLines.has(line);
  }

  private pushMissingReturnDiagnostic(): void {
    const startLine = this.methodNode.loc!.startLine - 1;
    const line = this.lines[startLine] ?? "";
    const functionIndex = line.search(/\bFunction\b/i);
    const range = new vscode.Range(
      startLine,
      functionIndex >= 0 ? functionIndex : 0,
      startLine,
      line.trimEnd().length,
    );
    const diagnostic = new vscode.Diagnostic(
      range,
      `O método Function "${this.methodNode.name}" pode retornar sem definir um valor de retorno expl­icito em todas as ramificaÃ§Ãµes de fluxo de controle.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = DiagnosticCodes.MissingReturnValue;
    this.diagnostics.push(diagnostic);
  }

  private checkStatements(
    statements: Statement[],
    state: FlowState,
    methodTail = false,
  ): FlowState {
    let current = this.cloneState(state);
    const lastExecutableIndex = methodTail ? findLastExecutableStatementIndex(statements) : -1;
    for (let index = 0; index < statements.length; index++) {
      const statement = statements[index];
      if (!statement) continue;
      if (!current.reachable) continue;
      this.reachableNodes.add(statement);
      current = this.checkStatement(
        statement,
        current,
        methodTail && index === lastExecutableIndex,
      );
    }
    return current;
  }

  private checkStatement(
    statement: Statement,
    state: FlowState,
    isMethodTailStatement: boolean,
  ): FlowState {
    switch (statement.kind) {
      case "ReturnStatement":
        if (isMethodTailStatement && !statement.expression) {
          this.pushRedundantTerminalExitDiagnostic(statement);
        }
        return { ...state, reachable: false, retValSet: true };
      case "ThrowStatement":
        return { ...state, reachable: false, retValSet: true };
      case "ContinueStatement":
        return { ...state, reachable: false };
      case "ExitStatement":
        if (
          statement.target === "Sub" ||
          statement.target === "Function" ||
          statement.target === "Property"
        ) {
          if (isMethodTailStatement) {
            this.pushRedundantTerminalExitDiagnostic(statement);
          } else if (this.isFunction && !state.retValSet) {
            this.hasMissingReturnPath = true;
          }
          return { ...state, reachable: false };
        }
        return state;
      case "Assignment": {
        const setsReturnValue = this.isAssignmentToReturnValue(statement);
        this.updateNullFactFromAssignment(statement.target, statement.value, state);
        return { ...state, reachable: true, retValSet: state.retValSet || setsReturnValue };
      }
      case "VariableDeclaration":
        if (statement.initializer) {
          this.updateNullFactForName(statement.name, statement.initializer, state);
        } else state.nullFacts.delete(statement.name.toLowerCase());
        return state;
      case "Block":
        return this.checkStatements(statement.statements, state, isMethodTailStatement);
      case "WithStatement":
      case "UsingStatement":
        return this.checkStatements(statement.body, state, isMethodTailStatement);
      case "IfStatement":
        return this.checkIfStatement(statement, state);
      case "SelectCaseStatement":
        return this.checkSelectCaseStatement(statement, state);
      case "ForStatement":
      case "ForEachStatement":
      case "WhileStatement":
        this.checkStatements(statement.body, state);
        return state;
      case "TryCatchStatement":
        return this.checkTryCatchStatement(statement, state, isMethodTailStatement);
      default:
        return state;
    }
  }

  private checkIfStatement(
    statement: Extract<Statement, { kind: "IfStatement" }>,
    state: FlowState,
  ): FlowState {
    const branches: { condition?: Expression; body: Statement[] }[] = [
      { condition: statement.condition, body: statement.thenBranch },
    ];
    statement.elseIfBranches.forEach((branch) =>
      branches.push({ condition: branch.condition, body: branch.body }),
    );
    if (statement.elseBranch) branches.push({ body: statement.elseBranch });
    let staticallyTrueSeen = false;
    let hasElseCoverage = false;
    const branchStates: FlowState[] = [];
    for (const branch of branches) {
      const condition = branch.condition
        ? this.evaluateStaticCondition(branch.condition, state)
        : true;
      const isReachable = !staticallyTrueSeen && condition !== false;
      if (condition === true) {
        staticallyTrueSeen = true;
        hasElseCoverage = true;
      }
      if (isReachable) branchStates.push(this.checkStatements(branch.body, this.cloneState(state)));
      else this.collectUnreachableBranch(branch.body);
    }
    if (branchStates.length === 0) return state;
    const reachable = branchStates.some((branch) => branch.reachable) || !hasElseCoverage;
    const retValSet = hasElseCoverage
      ? branchStates.every((branch) => branch.retValSet)
      : state.retValSet && branchStates.every((branch) => branch.retValSet);
    if (
      !reachable &&
      this.isFunction &&
      branchStates.some((branch) => !branch.retValSet && !branch.reachable)
    ) {
      this.hasMissingReturnPath = true;
    }
    return { ...state, reachable, retValSet };
  }

  private collectUnreachableBranch(statements: Statement[]): void {
    this.pushDeadCodeBlockDiagnostic(statements);
  }

  private checkSelectCaseStatement(
    statement: Extract<Statement, { kind: "SelectCaseStatement" }>,
    state: FlowState,
  ): FlowState {
    const states = statement.cases.map((caseClause) =>
      this.checkStatements(caseClause.body, state),
    );
    if (states.length === 0) return state;
    const hasElse = statement.cases.some((caseClause) => caseClause.isElse);
    return {
      ...state,
      reachable: states.some((caseState) => caseState.reachable) || !hasElse,
      retValSet: hasElse
        ? states.every((caseState) => caseState.retValSet)
        : state.retValSet && states.every((caseState) => caseState.retValSet),
    };
  }

  private checkTryCatchStatement(
    statement: Extract<Statement, { kind: "TryCatchStatement" }>,
    state: FlowState,
    isMethodTailStatement: boolean,
  ): FlowState {
    const canBranchEndMethod = isMethodTailStatement && !statement.finallyBody;
    const tryState = this.checkStatements(statement.tryBody, state, canBranchEndMethod);
    const catchState = this.checkStatements(statement.catchBody, state, canBranchEndMethod);
    const combined = {
      reachable: tryState.reachable || catchState.reachable,
      retValSet: tryState.retValSet && catchState.retValSet,
      nullFacts: new Map(state.nullFacts),
    };
    return statement.finallyBody
      ? this.checkStatements(statement.finallyBody, combined, isMethodTailStatement)
      : combined;
  }

  private pushRedundantTerminalExitDiagnostic(
    node: Extract<Statement, { kind: "ExitStatement" | "ReturnStatement" }>,
  ): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const line = this.lines[lineIdx] ?? "";
    const startChar = line.length - line.trimStart().length;
    const endChar = line.trimEnd().length;
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(lineIdx, startChar, lineIdx, endChar),
      "Comando terminal redundante no fim da rotina. Remova esta linha.",
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.code = DiagnosticCodes.RedundantTerminalExit;
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    const payload: RedundantTerminalExitPayload = {
      code: DiagnosticCodes.RedundantTerminalExit,
      line: lineIdx,
      startChar,
      endChar,
    };
    setDiagnosticPayload(diagnostic, payload);
    this.diagnostics.push(diagnostic);
  }

  private isAssignmentToReturnValue(node: Assignment): boolean {
    const target = node.target;
    return target.kind === "Identifier"
      ? target.name.toLowerCase() === this.methodNode.name.toLowerCase()
      : target.kind === "MemberAccess" &&
          target.member.toLowerCase() === this.methodNode.name.toLowerCase() &&
          target.target.kind === "Identifier" &&
          target.target.name.toLowerCase() === "me";
  }

  private cloneState(state: FlowState): FlowState {
    return {
      reachable: state.reachable,
      retValSet: state.retValSet,
      nullFacts: new Map(state.nullFacts),
    };
  }
  private updateNullFactFromAssignment(
    target: Expression,
    value: Expression,
    state: FlowState,
  ): void {
    if (target.kind === "Identifier") this.updateNullFactForName(target.name, value, state);
  }
  private updateNullFactForName(name: string, value: Expression, state: FlowState): void {
    const key = name.toLowerCase();
    if (value.kind === "Literal" && value.value === null) state.nullFacts.set(key, "null");
    else if (value.kind === "ObjectCreationExpression") state.nullFacts.set(key, "non-null");
    else state.nullFacts.delete(key);
  }

  private evaluateStaticCondition(expr: Expression, state: FlowState): boolean | undefined {
    if (expr.kind === "Literal") {
      if (expr.value === true || String(expr.value).toLowerCase() === "true") return true;
      if (expr.value === false || String(expr.value).toLowerCase() === "false") return false;
    }
    if (expr.kind !== "BinaryExpression") return undefined;
    const operator = expr.operator.toLowerCase();
    if (operator === "and" || operator === "andalso") {
      return this.evaluateLogicalAnd(expr.left, expr.right, state);
    }
    if (operator === "or" || operator === "orelse") {
      return this.evaluateLogicalOr(expr.left, expr.right, state);
    }
    const left = this.evaluateStaticValue(expr.left, state);
    const right = this.evaluateStaticValue(expr.right, state);
    if (left === undefined || right === undefined) return undefined;
    if (operator === "=") return left === right;
    if (operator === "<>") return left !== right;
    if (typeof left !== "number" || typeof right !== "number") return undefined;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    if (operator === ">=") return left >= right;
    return undefined;
  }

  private evaluateLogicalAnd(
    left: Expression,
    right: Expression,
    state: FlowState,
  ): boolean | undefined {
    const leftValue = this.evaluateStaticCondition(left, state);
    const rightValue = this.evaluateStaticCondition(right, state);
    return leftValue === false || rightValue === false
      ? false
      : leftValue === true && rightValue === true
        ? true
        : undefined;
  }
  private evaluateLogicalOr(
    left: Expression,
    right: Expression,
    state: FlowState,
  ): boolean | undefined {
    const leftValue = this.evaluateStaticCondition(left, state);
    const rightValue = this.evaluateStaticCondition(right, state);
    return leftValue === true || rightValue === true
      ? true
      : leftValue === false && rightValue === false
        ? false
        : undefined;
  }
  private evaluateStaticValue(expr: Expression, state: FlowState): StaticValue | undefined {
    if (expr.kind === "Literal") return expr.value;
    if (expr.kind === "Identifier") {
      const fact = state.nullFacts.get(expr.name.toLowerCase());
      return fact === "null" ? null : fact === "non-null" ? STATIC_NON_NULL : undefined;
    }
    if (expr.kind === "ObjectCreationExpression") return STATIC_NON_NULL;
    if (expr.kind === "UnaryExpression" && expr.operator === "-") {
      const value = this.evaluateStaticValue(expr.argument, state);
      return typeof value === "number" ? -value : undefined;
    }
    if (expr.kind !== "BinaryExpression") return undefined;
    const left = this.evaluateStaticValue(expr.left, state);
    const right = this.evaluateStaticValue(expr.right, state);
    if (typeof left !== "number" || typeof right !== "number") return undefined;
    if (expr.operator === "+") return left + right;
    if (expr.operator === "-") return left - right;
    if (expr.operator === "*") return left * right;
    return expr.operator === "/" && right !== 0 ? left / right : undefined;
  }
}

function isCommentOnlyOpaqueStatement(text: string): boolean {
  return /^\s*(?:'|rem\b)/i.test(text);
}

function findLastExecutableStatementIndex(statements: readonly Statement[]): number {
  for (let index = statements.length - 1; index >= 0; index--) {
    const statement = statements[index];
    if (!statement) continue;
    if (statement.kind === "OpaqueStatement" && isCommentOnlyOpaqueStatement(statement.text)) {
      continue;
    }
    return index;
  }
  return -1;
}
