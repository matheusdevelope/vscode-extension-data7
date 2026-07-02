import * as vscode from "../../platform/vscode-api";
import { ASTWalker } from "../../project/ast/ast";
import type {
  Node,
  TryCatchStatement,
  IfStatement,
  ReturnStatement,
  Assignment,
  Expression,
  MethodInvocation,
  ForEachStatement,
  TaggedTemplateExpression,
  TernaryExpression,
  MethodDeclaration,
  DelegateDeclaration,
} from "../../project/ast/ast";
import { DiagnosticCodes, LegacyDiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type {
  ChainedGlobalFunctionAssignmentPayload,
  FinallyBlockUnsupportedPayload,
  InlineIfThenPayload,
  MissingThenPayload,
  InvalidInterpolationPayload,
  NotEnumerablePayload,
  ElseIfWhitespacePayload,
  ReturnUnrecommendedPayload,
  ReturnAssignmentInCatchPayload,
  SharedReturnGlobalFunctionPayload,
  TernaryContextUnsupportedPayload,
} from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";
import { getCommentStartIndex } from "../../utils/suppression-comments";
import { exprToString, typeRefToString } from "../diagnostic-helpers";
import { TypeResolver } from "../../analysis/type-resolver";
import { SymbolInfo } from "../../analysis/symbol-indexer";
import { detectEnumerable } from "../../analysis/enumerable-detector";
import { parseInterpolation } from "../../utils/interpolation";
import { ASTFlowAnalyzer } from "../ast-flow-analyzer";

export class ControlFlowRule implements Rule {
  public readonly name = "control-flow";

  private static readonly LEGACY_FINALLY_WARNING_ENABLED = true;

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    switch (node.kind) {
      case "TryCatchStatement":
        this.checkTryCatchStatement(node, context);
        break;
      case "IfStatement":
        this.checkIfStatement(node, context);
        break;
      case "ReturnStatement":
        this.checkReturnStatement(node, context);
        break;
      case "Assignment":
        this.checkAssignmentFlow(node, context);
        break;
      case "ForEachStatement":
        this.checkForEachStatement(node, context);
        break;
      case "TaggedTemplateExpression":
        this.checkTaggedTemplateExpression(node, context);
        break;
      case "TernaryExpression":
        this.checkTernaryExpression(node, context);
        break;
      case "MethodDeclaration":
        this.checkMethodDeclaration(node, context);
        break;
      case "DelegateDeclaration":
        this.checkDelegateDeclaration(node, context);
        break;
    }
  }

  private checkForEachStatement(node: ForEachStatement, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    const enumerableType = TypeResolver.resolveExpressionType(
      node.enumerable,
      context.document,
      lineIdx,
      context.indexer,
    );
    const explicitType = node.elementType ? typeRefToString(node.elementType) : undefined;

    const enumerable = enumerableType
      ? detectEnumerable(
          enumerableType,
          (typeName) => TypeResolver.getAllMembersForType(typeName, context.indexer),
          explicitType,
        )
      : undefined;

    if (enumerable) return;

    const typeName = enumerableType ?? "Variant";
    const startChar = node.enumerable.loc ? node.enumerable.loc.startChar : 0;
    const endChar = node.enumerable.loc ? node.enumerable.loc.endChar : 0;
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `O tipo "${typeName}" não expõe a propriedade "Count" e um indexador inteiro, ` +
        `requisitos do "For Each". O compilador não conseguirá transpilar esta linha.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.NotEnumerable;
    const payload: NotEnumerablePayload = {
      code: DiagnosticCodes.NotEnumerable,
      typeName,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private checkTaggedTemplateExpression(
    node: TaggedTemplateExpression,
    context: RuleContext,
  ): void {
    if (!node.loc || node.tag !== "") return;
    const lineIdx = node.loc.startLine - 1;

    const result = parseInterpolation(node.body);
    for (const interpolationDiagnostic of result.diagnostics) {
      const absCol = node.loc.startChar + interpolationDiagnostic.column;
      const range = new vscode.Range(lineIdx, absCol, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `String interpolada \`$"..."\` mal formada (${interpolationDiagnostic.reason}). O Builder não conseguirá expandir esta linha.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.InvalidInterpolation;
      const payload: InvalidInterpolationPayload = {
        code: DiagnosticCodes.InvalidInterpolation,
        reason: interpolationDiagnostic.reason,
      };
      setDiagnosticPayload(diag, payload);
      context.report(diag);
    }
  }

  private checkTernaryExpression(node: TernaryExpression, context: RuleContext): void {
    if (!node.loc || context.allowedTernaries.has(node)) return;

    const lineIdx = node.loc.startLine - 1;
    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Ternário \`?:\` fora de contexto de assignment. O Builder só expande ternários em \`Dim x = c ? a : b\`, \`x = c ? a : b\` ou \`obj.prop = c ? a : b\` (forma nativa é \`If/Then/Else/End If\`).`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.TernaryContextUnsupported;
    const payload: TernaryContextUnsupportedPayload = {
      code: DiagnosticCodes.TernaryContextUnsupported,
      context: "non-assignment",
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private checkMethodDeclaration(node: MethodDeclaration, context: RuleContext): void {
    if (node.modifiers?.includes("declare")) {
      this.checkDeclareMethodDeclaration(node, context);
      return;
    }

    const isFunction =
      node.returnType && typeRefToString(node.returnType)?.toLowerCase() !== "void";
    if (isFunction) {
      this.checkFunctionSelfRead(node, context);
    }

    if (node.body.length > 0) {
      const flowAnalyzer = new ASTFlowAnalyzer(node, context.lines, context.diagnostics);
      flowAnalyzer.run();
    }

    if (!node.noParentheses || node.parameters.length !== 0 || !node.loc) return;
    const nameLower = node.name.toLowerCase();
    if (nameLower === "get" || nameLower === "set") return;

    const range = new vscode.Range(
      node.loc.startLine - 1,
      node.loc.startChar,
      node.loc.startLine - 1,
      node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `A declaração do método/função "${node.name}" não possui parênteses. Recomenda-se o uso de parênteses "()" para seguir o padrão da linguagem.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.DeclarationParenthesesMismatch;
    context.report(diag);
  }

  private checkDeclareMethodDeclaration(node: MethodDeclaration, context: RuleContext): void {
    const loc = node.declareNameParenthesesLoc;
    if (!loc) return;

    const lineIdx = loc.startLine - 1;
    const range = new vscode.Range(lineIdx, loc.startChar, lineIdx, loc.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `A instrução Declare "${node.name}" não permite parênteses após o nome. Declare parâmetros depois de Lib/Alias, por exemplo: Declare Function ${node.name} Lib "..." (...) As Long.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.DeclareNameParentheses;
    context.report(diag);
  }

  private checkFunctionSelfRead(node: MethodDeclaration, context: RuleContext): void {
    const funcName = node.name.toLowerCase();
    new (class extends ASTWalker {
      private readonly parentStack: Node[] = [];

      public constructor(private readonly diagnostics: vscode.Diagnostic[]) {
        super();
      }

      public override walk(idNode: Node): void {
        if (idNode.kind === "Identifier" && idNode.name.toLowerCase() === funcName && idNode.loc) {
          const parent = this.parentStack[this.parentStack.length - 1];
          const isPlainAssignment = parent?.kind === "Assignment" && parent.target === idNode;
          const isCall =
            parent?.kind === "MethodInvocation" && parent.methodName.toLowerCase() === funcName;

          if (!isPlainAssignment && !isCall) {
            const lineIdx = idNode.loc.startLine - 1;
            const range = new vscode.Range(
              lineIdx,
              idNode.loc.startChar,
              lineIdx,
              idNode.loc.endChar,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Leitura do nome da função "${idNode.name}" dentro de seu próprio corpo não é permitida. Para chamar recursivamente, use parênteses.`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.FunctionReadSelf;
            this.diagnostics.push(diag);
          }
        }
        this.parentStack.push(idNode);
        super.walk(idNode);
        this.parentStack.pop();
      }
    })(context.diagnostics).walk(node);
  }

  private checkDelegateDeclaration(node: DelegateDeclaration, context: RuleContext): void {
    if (!node.noParentheses || node.parameters.length !== 0 || !node.loc) return;

    const range = new vscode.Range(
      node.loc.startLine - 1,
      node.loc.startChar,
      node.loc.startLine - 1,
      node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `A declaração do método/função "${node.name}" não possui parênteses. Recomenda-se o uso de parênteses "()" para seguir o padrão da linguagem.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.DeclarationParenthesesMismatch;
    context.report(diag);
  }

  private checkTryCatchStatement(node: TryCatchStatement, context: RuleContext): void {
    if (ControlFlowRule.LEGACY_FINALLY_WARNING_ENABLED && node.finallyBody && node.loc) {
      if (this.isCatchBodyWrappedWithAssignedCheck(node)) {
        return;
      }

      const lineIdx = node.loc.startLine - 1;
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `O uso de 'Finally' no bloco Try/Catch não é recomendado devido a um bug conhecido no compilador que sempre executa o bloco 'Catch'.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = LegacyDiagnosticCodes.FinallyBlockUnsupported;

      const tryBody = node.tryBody;
      const catchBody = node.catchBody;
      const nodeLoc = node.loc;

      let catchLine = -1;
      let startSearchLine = nodeLoc.startLine;
      if (tryBody.length > 0) {
        const lastTryStmt = tryBody[tryBody.length - 1];
        if (lastTryStmt?.loc) {
          startSearchLine = lastTryStmt.loc.endLine;
        }
      }

      const firstStmt = catchBody[0];
      const lastStmt = catchBody[catchBody.length - 1];
      const endSearchLine = firstStmt?.loc?.startLine ?? nodeLoc.endLine;

      for (let i = startSearchLine - 1; i < endSearchLine; i++) {
        const lineText = context.lines[i] ?? "";
        if (/^\s*Catch\b/i.test(lineText)) {
          catchLine = i;
          break;
        }
      }

      if (catchLine !== -1) {
        const finallyLine = this.findTryCatchKeywordLine(
          context.lines,
          "Finally",
          catchLine + 1,
          nodeLoc.endLine,
        );
        const endTryLine = this.findTryCatchKeywordLine(
          context.lines,
          "End\\s+Try",
          finallyLine !== -1 ? finallyLine + 1 : catchLine + 1,
          nodeLoc.endLine,
        );
        const payload: FinallyBlockUnsupportedPayload = {
          code: LegacyDiagnosticCodes.FinallyBlockUnsupported,
          catchLine,
          catchBodyStartLine: firstStmt?.loc ? firstStmt.loc.startLine - 1 : -1,
          catchBodyEndLine: lastStmt?.loc ? lastStmt.loc.endLine - 1 : -1,
          catchVarName: node.catchVar?.name,
          isEmptyCatch: catchBody.length === 0,
          isEmptyFinally: node.finallyBody.length === 0,
          finallyLine: finallyLine !== -1 ? finallyLine : undefined,
          finallyEndLine: endTryLine !== -1 ? endTryLine - 1 : undefined,
        };
        setDiagnosticPayload(diag, payload);
      }

      context.report(diag);
    }
  }

  private isCatchBodyWrappedWithAssignedCheck(node: TryCatchStatement): boolean {
    if (!node.catchVar) {
      return false;
    }
    if (node.catchBody.length !== 1) {
      return false;
    }
    const stmt = node.catchBody[0];
    if (stmt?.kind !== "IfStatement") {
      return false;
    }
    if (stmt.elseIfBranches.length > 0 || stmt.elseBranch) {
      return false;
    }
    const cond = stmt.condition;
    if (
      cond.kind === "MethodInvocation" &&
      cond.methodName.toLowerCase() === "assigned" &&
      cond.arguments.length === 1
    ) {
      const arg = cond.arguments[0];
      if (
        arg?.kind === "Identifier" &&
        arg.name.toLowerCase() === node.catchVar.name.toLowerCase()
      ) {
        return true;
      }
    }
    return false;
  }

  private findTryCatchKeywordLine(
    lines: readonly string[],
    keywordPattern: string,
    startLine: number,
    endLine: number,
  ): number {
    const regex = new RegExp(`^\\s*${keywordPattern}\\b`, "i");
    const last = Math.min(lines.length, endLine);
    for (let i = Math.max(0, startLine); i < last; i++) {
      if (regex.test(lines[i] ?? "")) return i;
    }
    return -1;
  }

  private checkIfStatement(node: IfStatement, context: RuleContext): void {
    if (node.singleLine && node.loc) {
      const lineIdx = node.loc.startLine - 1;
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        "A sintaxe 'If ... Then' inline não é recomendada. Prefira usar bloco 'If ... Then ... End If'.",
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.InlineIfThen;
      const payload: InlineIfThenPayload = {
        code: DiagnosticCodes.InlineIfThen,
        line: lineIdx,
      };
      setDiagnosticPayload(diag, payload);
      context.report(diag);
    }

    if (node.hasThen === false && node.loc) {
      let insertLine = node.loc.startLine - 1;
      while (insertLine < context.lines.length) {
        const lineText = context.lines[insertLine] ?? "";
        if (!lineText.trim().endsWith("_")) {
          break;
        }
        insertLine++;
      }
      const targetLineText = context.lines[insertLine] ?? "";
      const commentIdx = getCommentStartIndex(targetLineText);
      const insertCol = targetLineText
        .substring(0, commentIdx === -1 ? targetLineText.length : commentIdx)
        .trimEnd().length;

      const range = new vscode.Range(insertLine, 0, insertLine, targetLineText.length);
      const diag = new vscode.Diagnostic(
        range,
        `Instrução 'If' sem a palavra-chave 'Then'.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.MissingThen;
      const payload: MissingThenPayload = {
        code: DiagnosticCodes.MissingThen,
        line: insertLine,
        insertColumn: insertCol,
      };
      setDiagnosticPayload(diag, payload);
      context.report(diag);
    }

    for (const branch of node.elseIfBranches) {
      if (branch.hasSpace && branch.loc) {
        const lineIdx = branch.loc.startLine - 1;
        const range = new vscode.Range(
          lineIdx,
          branch.loc.startChar,
          lineIdx,
          branch.loc.startChar + 7,
        );
        const diag = new vscode.Diagnostic(
          range,
          `A sintaxe 'Else If' com espaço não é aceita pelo compilador. Use 'ElseIf'.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.ElseIfWhitespace;
        const payload: ElseIfWhitespacePayload = {
          code: DiagnosticCodes.ElseIfWhitespace,
          line: lineIdx,
          column: branch.loc.startChar,
        };
        setDiagnosticPayload(diag, payload);
        context.report(diag);
      }

      if (branch.hasThen === false && branch.loc) {
        let insertLine = branch.loc.startLine - 1;
        while (insertLine < context.lines.length) {
          const lineText = context.lines[insertLine] ?? "";
          if (!lineText.trim().endsWith("_")) {
            break;
          }
          insertLine++;
        }
        const targetLineText = context.lines[insertLine] ?? "";
        const commentIdx = getCommentStartIndex(targetLineText);
        const insertCol = targetLineText
          .substring(0, commentIdx === -1 ? targetLineText.length : commentIdx)
          .trimEnd().length;

        const range = new vscode.Range(insertLine, 0, insertLine, targetLineText.length);
        const diag = new vscode.Diagnostic(
          range,
          `Instrução 'ElseIf' sem a palavra-chave 'Then'.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.MissingThen;
        const payload: MissingThenPayload = {
          code: DiagnosticCodes.MissingThen,
          line: insertLine,
          insertColumn: insertCol,
        };
        setDiagnosticPayload(diag, payload);
        context.report(diag);
      }
    }
  }

  private checkReturnStatement(node: ReturnStatement, context: RuleContext): void {
    if (!node.loc) return;

    if (context.activeProperty) return;
    if (this.isInsideLambdaFunction(context)) return;
    const lineIdx = node.loc.startLine - 1;

    let isSingleLineIf = false;
    for (let i = context.parentStack.length - 1; i >= 0; i--) {
      const parentNode = context.parentStack[i];
      if (parentNode?.kind === "IfStatement") {
        if (parentNode.singleLine) {
          isSingleLineIf = true;
        }
        break;
      }
    }

    const inSub = !!context.activeMethod && !context.activeMethod.returnType;
    const inFunction = !!context.activeMethod && !!context.activeMethod.returnType;

    const targetName = inFunction ? context.activeMethod?.name : undefined;
    const exitType = inFunction ? "Function" : "Sub";
    if (targetName && node.expression) {
      const sharedReturnGlobal = this.resolveSharedReturnGlobalFunction(
        node.expression,
        lineIdx,
        context,
      );
      if (sharedReturnGlobal) {
        this.pushSharedReturnGlobalFunctionDiagnostic(
          node.expression,
          sharedReturnGlobal,
          lineIdx,
          undefined,
          context,
        );
      }
    }
    if (targetName && this.isInsideCatchBlock(node, context)) return;

    let msg = "O uso de 'Return' não é recomendado devido a lentidão gerada no compilador.";
    if (inSub) {
      msg = "O uso de 'Return' não é recomendado. Prefira usar 'Exit Sub'.";
    } else if (targetName) {
      msg = `O uso de 'Return' não é recomendado. Prefira atribuir o valor a "${targetName}" e usar 'Exit ${exitType}'.`;
    }

    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Warning);
    diag.code = DiagnosticCodes.ReturnUnrecommended;

    let expressionText: string | undefined;
    if (node.expression?.loc) {
      const startL = node.expression.loc.startLine - 1;
      const startC = node.expression.loc.startChar;
      const endL = node.expression.loc.endLine - 1;
      const endC = node.expression.loc.endChar;
      if (startL === endL) {
        expressionText = (context.lines[startL] ?? "").substring(startC, endC);
      } else {
        expressionText = exprToString(node.expression);
      }
    }

    const payload: ReturnUnrecommendedPayload = {
      code: DiagnosticCodes.ReturnUnrecommended,
      line: lineIdx,
      startChar: node.loc.startChar,
      endChar: node.loc.endChar,
      expressionText,
      exitType,
      targetName,
      isConditional: context.conditionalBlockDepth > 0,
      isSingleLineIf,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private checkAssignmentFlow(node: Assignment, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    const isCurrentFunctionReturnTarget = this.isCurrentReturnAssignmentTarget(node, context);
    if (isCurrentFunctionReturnTarget && this.isInsideCatchBlock(node, context)) {
      this.pushReturnAssignmentInCatchDiagnostic(node, context);
    }

    const sharedReturnGlobal = this.resolveSharedReturnGlobalFunction(node.value, lineIdx, context);
    if (isCurrentFunctionReturnTarget && sharedReturnGlobal) {
      this.pushSharedReturnGlobalFunctionDiagnostic(
        node.value,
        sharedReturnGlobal,
        lineIdx,
        node.target,
        context,
      );
    } else {
      const chainedGlobalRoot = this.findChainedGlobalFunctionRoot(node.value, lineIdx, context);
      if (chainedGlobalRoot) {
        this.pushChainedGlobalFunctionAssignmentDiagnostic(
          node.value,
          chainedGlobalRoot,
          lineIdx,
          context,
        );
      }
    }
  }

  private pushReturnAssignmentInCatchDiagnostic(node: Assignment, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const lineText = context.lines[lineIdx] ?? "";
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc.startChar,
      lineIdx,
      node.target.loc?.endChar ?? node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      "Retorno por atribuição dentro de Catch não é aceito pelo compilador nativo. Use 'Return <valor>'.",
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.ReturnAssignmentInCatch;

    let expressionText: string | undefined = exprToString(node.value);
    if (node.value.loc) {
      const startLine = node.value.loc.startLine - 1;
      const endLine = node.value.loc.endLine - 1;
      if (startLine === endLine) {
        expressionText = (context.lines[startLine] ?? "").substring(
          node.value.loc.startChar,
          node.value.loc.endChar,
        );
        if (expressionText.trim().length === 0) {
          expressionText = exprToString(node.value);
        }
      } else {
        expressionText = exprToString(node.value);
      }
    }
    const expressionTextFromLine = this.expressionTextFromAssignmentLine(lineText, node);
    if (
      expressionTextFromLine &&
      (!expressionText || expressionTextFromLine.startsWith(expressionText))
    ) {
      expressionText = expressionTextFromLine;
    }

    const payload: ReturnAssignmentInCatchPayload = {
      code: DiagnosticCodes.ReturnAssignmentInCatch,
      line: lineIdx,
      startChar: node.loc.startChar,
      endChar: Math.max(node.loc.endChar, lineText.trimEnd().length),
      expressionText,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private expressionTextFromAssignmentLine(lineText: string, node: Assignment): string | undefined {
    const startChar = node.target.loc?.endChar ?? node.loc?.startChar ?? 0;
    const equalsIndex = lineText.indexOf("=", startChar);
    if (equalsIndex === -1) return undefined;
    const commentIndex = this.findInlineCommentColumn(lineText, equalsIndex + 1);
    const endChar = commentIndex === -1 ? lineText.length : commentIndex;
    const expressionText = lineText.slice(equalsIndex + 1, endChar).trim();
    return expressionText.length > 0 ? expressionText : undefined;
  }

  private findInlineCommentColumn(lineText: string, startColumn: number): number {
    let inString = false;
    for (let index = startColumn; index < lineText.length; index++) {
      const char = lineText[index];
      if (char === '"') {
        if (inString && lineText[index + 1] === '"') {
          index++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && char === "'") return index;
    }
    return -1;
  }

  private isCurrentReturnAssignmentTarget(node: Assignment, context: RuleContext): boolean {
    if (node.target.kind !== "Identifier") return false;
    const targetName = node.target.name.toLowerCase();
    const activeMethodName =
      context.activeMethod?.returnType !== undefined ? context.activeMethod.name.toLowerCase() : "";
    const activePropertyName = context.activeProperty?.name.toLowerCase() ?? "";
    return targetName === activeMethodName || targetName === activePropertyName;
  }

  private isInsideCatchBlock(node: Node, context: RuleContext): boolean {
    if (!node.loc) return false;
    const line = node.loc.startLine;
    return context.parentStack.some((parent) => {
      if (parent.kind !== "TryCatchStatement" || parent.catchBody.length === 0) return false;
      const first = parent.catchBody[0]?.loc;
      const last = parent.catchBody[parent.catchBody.length - 1]?.loc;
      if (!first || !last) return false;
      return line >= first.startLine && line <= last.endLine;
    });
  }

  private isInsideLambdaFunction(context: RuleContext): boolean {
    return context.parentStack.some(
      (parent) =>
        parent.kind === "ArrowFunctionExpression" &&
        (parent.lambdaKind ?? (parent.returnType ? "Function" : "Function")) === "Function",
    );
  }

  private resolveSharedReturnGlobalFunction(
    expr: Expression,
    lineIdx: number,
    context: RuleContext,
  ):
    | {
        readonly root: MethodInvocation;
        readonly rootSymbol: SymbolInfo;
        readonly startChar: number;
        readonly endChar: number;
        readonly rootText: string;
        readonly suffixText: string;
      }
    | undefined {
    if (!this.isActiveSharedFunction(context)) return undefined;

    const directSymbol =
      expr.kind === "MethodInvocation"
        ? this.resolveGlobalFunctionInvocation(expr, lineIdx, context)
        : undefined;
    const root = directSymbol ? expr : this.findChainedGlobalFunctionRoot(expr, lineIdx, context);
    if (!root) return undefined;
    const rootSymbol = directSymbol ?? this.resolveGlobalFunctionInvocation(root, lineIdx, context);
    if (!rootSymbol) return undefined;

    const lineText = context.lines[lineIdx] ?? "";
    const startChar = expr.loc?.startChar ?? root.loc?.startChar ?? 0;
    const endChar = this.findExpressionEndColumn(lineText, startChar);
    const rootStart = root.loc?.startChar ?? startChar;

    const rootEnd = this.findInvocationEndColumn(
      lineText,
      rootStart,
      (root as MethodInvocation).methodName,
    );
    if (rootEnd <= rootStart || rootEnd > endChar) return undefined;

    return {
      root: root as MethodInvocation,
      rootSymbol,
      startChar,
      endChar,
      rootText: lineText.slice(rootStart, rootEnd).trim(),
      suffixText: lineText.slice(rootEnd, endChar).trim(),
    };
  }

  private isActiveSharedFunction(context: RuleContext): boolean {
    return (
      context.activeMethod?.returnType !== undefined &&
      (context.activeMethod.modifiers ?? []).some((modifier) => modifier.toLowerCase() === "shared")
    );
  }

  private findChainedGlobalFunctionRoot(
    expr: Expression,
    lineIdx: number,
    context: RuleContext,
  ): MethodInvocation | undefined {
    switch (expr.kind) {
      case "MemberAccess":
        if (this.isGlobalFunctionInvocation(expr.target, lineIdx, context)) {
          return expr.target;
        }
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx, context);
      case "MethodInvocation":
        if (!expr.callee) return undefined;
        if (this.isGlobalFunctionInvocation(expr.callee, lineIdx, context)) {
          return expr.callee;
        }
        return this.findChainedGlobalFunctionRoot(expr.callee, lineIdx, context);
      case "ArrayAccessExpression":
        if (this.isGlobalFunctionInvocation(expr.target, lineIdx, context)) {
          return expr.target;
        }
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx, context);
      case "OptionalChainingExpression":
        return this.findChainedGlobalFunctionRoot(expr.target, lineIdx, context);
      default:
        return undefined;
    }
  }

  private isGlobalFunctionInvocation(
    expr: Expression,
    lineIdx: number,
    context: RuleContext,
  ): expr is MethodInvocation {
    return this.resolveGlobalFunctionInvocation(expr, lineIdx, context) !== undefined;
  }

  private resolveGlobalFunctionInvocation(
    expr: Expression,
    lineIdx: number,
    context: RuleContext,
  ): SymbolInfo | undefined {
    if (expr.kind !== "MethodInvocation" || expr.callee) return undefined;
    const resolved = TypeResolver.findUnqualifiedCallable(
      expr.methodName,
      context.document,
      lineIdx,
      context.indexer,
      expr.arguments.map((arg) =>
        TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
      ),
    );
    if (!resolved) return undefined;
    if (resolved.kind !== "method" && resolved.kind !== "declare_function") return undefined;
    if (resolved.type.toLowerCase() === "void") return undefined;
    if (resolved.fileUri === "system://library") return undefined;
    const ownerLower = resolved.containerName?.toLowerCase();
    if (!ownerLower) return resolved;
    if (ownerLower === context.activeClass?.name.toLowerCase()) return undefined;
    if (context.activeClassInheritedNames?.has(ownerLower)) return undefined;
    return resolved;
  }

  private pushChainedGlobalFunctionAssignmentDiagnostic(
    expr: Expression,
    root: MethodInvocation,
    lineIdx: number,
    context: RuleContext,
  ): void {
    const lineText = context.lines[lineIdx] ?? "";
    const startChar = expr.loc?.startChar ?? 0;
    const endChar =
      expr.loc && expr.loc.endChar > expr.loc.startChar
        ? expr.loc.endChar
        : this.findExpressionEndColumn(lineText, startChar);
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Atribuicao direta a partir da cadeia iniciada pela Funcao global "${root.methodName}" pode falhar no compilador Data7. Armazene o retorno da Funcao em uma variavel temporaria antes de acessar membros.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.ChainedGlobalFunctionAssignment;
    const payload: ChainedGlobalFunctionAssignmentPayload = {
      code: DiagnosticCodes.ChainedGlobalFunctionAssignment,
      line: lineIdx,
      startChar,
      endChar,
      functionName: root.methodName,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private findExpressionEndColumn(lineText: string, startChar: number): number {
    let braceCount = 0;
    let insideStr = false;
    for (let i = startChar; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === '"') {
        if (insideStr && lineText[i + 1] === '"') {
          i++;
          continue;
        }
        insideStr = !insideStr;
        continue;
      }
      if (!insideStr) {
        if (char === "(" || char === "[") braceCount++;
        else if (char === ")" || char === "]") {
          braceCount--;
          if (braceCount < 0) return i;
        } else if (char === "," && braceCount === 0) return i;
        else if (char === "'" && braceCount === 0) return i;
      }
    }
    return lineText.length;
  }

  private findInvocationEndColumn(lineText: string, startChar: number, methodName: string): number {
    const idx = lineText.toLowerCase().indexOf(methodName.toLowerCase(), startChar);
    if (idx === -1) return startChar;
    let i = idx + methodName.length;
    while (i < lineText.length && (lineText[i] === " " || lineText[i] === "\t")) i++;
    if (lineText[i] === "(") {
      let braceCount = 1;
      i++;
      while (i < lineText.length && braceCount > 0) {
        const char = lineText[i];
        if (char === "(") braceCount++;
        else if (char === ")") braceCount--;
        i++;
      }
    }
    return i;
  }

  private pushSharedReturnGlobalFunctionDiagnostic(
    expr: Expression,
    info: {
      readonly rootText: string;
      readonly suffixText: string;
      readonly rootSymbol: SymbolInfo;
      readonly startChar: number;
      readonly endChar: number;
    },
    lineIdx: number,
    lhsTarget: Expression | undefined,
    context: RuleContext,
  ): void {
    const isAssignment = lhsTarget !== undefined;
    const startChar = expr.loc?.startChar ?? info.startChar;
    const endChar = expr.loc?.endChar ?? info.endChar;
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);

    const targetName = context.activeMethod?.name ?? "";
    const diag = new vscode.Diagnostic(
      range,
      isAssignment
        ? `Retorno implicitamente encadeado por atribuição a "${exprToString(lhsTarget)}" em método Shared não é recomendado. Atribua a "${targetName}" e use 'Exit Function'.`
        : `Retorno implicitamente encadeado por 'Return' em método Shared não é recomendado. Atribua a "${targetName}" e use 'Exit Function'.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.SharedReturnGlobalFunction;
    const payload: SharedReturnGlobalFunctionPayload = {
      code: DiagnosticCodes.SharedReturnGlobalFunction,
      line: lineIdx,
      startChar: info.startChar,
      endChar: info.endChar,
      targetName,
      rootText: info.rootText,
      suffixText: info.suffixText,
      tempName: `__data7GlobalReturn${lineIdx + 1}`,
      tempType:
        (info.rootSymbol.type ||
          (context.activeMethod?.returnType
            ? typeRefToString(context.activeMethod.returnType)
            : undefined)) ??
        "Variant",
      exitType: "Function",
      isInsideCatch: this.isInsideCatchBlock(expr, context),
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }
}
