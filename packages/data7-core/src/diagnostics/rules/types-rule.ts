import * as vscode from "../../platform/vscode-api";
import type {
  Node,
  TypeReference,
  VariableDeclaration,
  Assignment,
  ClassDeclaration,
  MethodDeclaration,
  ObjectCreationExpression,
  Expression,
  MethodInvocation,
  ArrowFunctionExpression,
  Statement,
  PropertyDeclaration,
} from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";
import { DiagnosticsLinter } from "../diagnostics";
import { TypeResolver } from "../../analysis/type-resolver";
import { typeRefToString, exprToString } from "../diagnostic-helpers";
import { PRIMITIVE_TYPES } from "../../utils/primitive-types";
import { SymbolInfo } from "../../analysis/symbol-indexer";
import { lookupSystemByName } from "../../system-library";
import { readConfiguration } from "../../infra/configuration";
import { SugarEngine } from "../../project/sugars";

export class TypesRule implements Rule {
  public readonly name = "types";

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    switch (node.kind) {
      case "TypeReference":
        this.checkTypeReference(node, context);
        break;
      case "VariableDeclaration":
        this.checkVariableDeclaration(node, context);
        break;
      case "Assignment":
        this.checkAssignmentTypes(node, context);
        break;
      case "ClassDeclaration":
        this.checkClassModifiers(node, context);
        this.checkClassMustOverride(node, context);
        this.checkOverrideDeclarations(node, context);
        break;
      case "ObjectCreationExpression":
        this.checkObjectCreationExpression(node, context);
        break;
      case "MethodInvocation":
        this.checkLambdaArguments(node, context);
        break;
    }
  }

  private checkObjectCreationExpression(
    node: ObjectCreationExpression,
    context: RuleContext,
  ): void {
    if (node.loc) {
      const classSymbol = TypeResolver.findClassSymbol(node.type.name, context.indexer);
      if (classSymbol?.isMustInherit) {
        const lineIdx = Math.max(0, node.loc.startLine - 1);
        const range = new vscode.Range(
          lineIdx,
          node.loc.startChar,
          lineIdx,
          node.loc.startChar + Math.max("New ".length + node.type.name.length, 1),
        );
        const diag = new vscode.Diagnostic(
          range,
          `A classe "${node.type.name}" esta marcada como MustInherit e nao pode ser instanciada diretamente.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.AbstractInstantiation;
        context.report(diag);
      }
    }

    if (!node.noParentheses || !node.type.loc) return;
    const range = new vscode.Range(
      node.type.loc.startLine - 1,
      node.type.loc.startChar,
      node.type.loc.endLine - 1,
      node.type.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `A instanciação de "${node.type.name}" omitiu os parênteses do construtor. Recomenda-se usar "${node.type.name}()".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.ObjectCreationParenthesesMissing;
    context.report(diag);
  }

  private checkTypeReference(node: TypeReference, context: RuleContext): void {
    if (!node.loc) return;
    if (context.isGenericTypeParameter(node.name)) return;
    if (this.isArrayListRuntimeType(node.name) && this.isArrayListSugarEnabled()) return;
    const lineIdx = node.loc.startLine - 1;
    const col = node.loc.startChar;
    if (context.isExternalTypeAllowed(node.name, lineIdx)) return;

    DiagnosticsLinter.validateTypeReference(
      node.name,
      lineIdx,
      col,
      context.document,
      context.indexer,
      context.diagnostics,
    );
  }

  private isArrayListRuntimeType(typeName: string): boolean {
    const lower = typeName.toLowerCase();
    return lower === "ttlist" || lower.startsWith("ttlist_");
  }

  private isArrayListSugarEnabled(): boolean {
    const config = readConfiguration();
    return new SugarEngine({
      enabled: config.features.language.sugars && config.sugars.enabled,
      enabledSugarIds: config.sugars.enabledIds,
      disabledSugarIds: config.sugars.disabledIds,
    }).isEnabled("array-list");
  }

  private checkVariableDeclaration(node: VariableDeclaration, context: RuleContext): void {
    if (!node.loc || !node.type || !node.initializer) return;
    const lineIdx = node.loc.startLine - 1;

    const lhsType = typeRefToString(node.type);
    const rhsType = TypeResolver.resolveExpressionType(
      node.initializer,
      context.document,
      lineIdx,
      context.indexer,
    );

    if (lhsType && this.isLambdaAssignedToDelegate(lhsType, node.initializer, context)) return;

    if (lhsType && rhsType && rhsType.toLowerCase() !== "void") {
      if (!DiagnosticsLinter.isTypeCompatible(rhsType, lhsType, context.indexer)) {
        const range = new vscode.Range(
          lineIdx,
          node.initializer.loc?.startChar ?? 0,
          lineIdx,
          node.initializer.loc?.endChar ?? 0,
        );
        const diag = new vscode.Diagnostic(
          range,
          `Incompatibilidade de tipos: não é possível atribuir "${rhsType}" para "${lhsType}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.TypeMismatch;
        context.report(diag);
      }
    }
  }

  private checkAssignmentTypes(node: Assignment, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;

    this.checkEventSignatureMismatch(node, lineIdx, context);
    this.checkLambdaAssignment(node, lineIdx, context);

    const lhsType = TypeResolver.resolveExpressionType(
      node.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    const rhsType = TypeResolver.resolveExpressionType(
      node.value,
      context.document,
      lineIdx,
      context.indexer,
    );

    const isLocalAssignmentTarget =
      node.target.kind === "Identifier" && context.isLocalDeclared(node.target.name);
    const isCurrentFunctionReturnTarget = this.isCurrentReturnAssignmentTarget(node, context);

    let resolvedLhs: SymbolInfo | undefined;
    if (node.target.kind === "Identifier" && !isLocalAssignmentTarget) {
      if (context.activeClass) {
        resolvedLhs = TypeResolver.findMember(
          context.activeClass.name,
          node.target.name,
          context.indexer,
        );
      }
      resolvedLhs ??= context.indexer.findSymbolByName(
        node.target.name,
        context.document.uri.toString(),
      );
    } else if (node.target.kind === "MemberAccess") {
      const type = TypeResolver.resolveExpressionType(
        node.target.target,
        context.document,
        lineIdx,
        context.indexer,
      );
      if (type) {
        resolvedLhs = TypeResolver.findMember(type, node.target.member, context.indexer);
      }
    }

    // Validação de modificador ReadOnly
    if (resolvedLhs) {
      const isReadOnlyField = !!resolvedLhs.isReadOnly;
      if (resolvedLhs.isConst || isReadOnlyField) {
        let isAllowed = false;
        if (
          isReadOnlyField &&
          context.activeClass &&
          context.activeMethod?.name.toLowerCase() === "new"
        ) {
          const declaringClass = resolvedLhs.containerName?.toLowerCase();
          if (declaringClass === context.activeClass.name.toLowerCase()) {
            isAllowed = true;
          }
        }
        if (!isAllowed) {
          const range = new vscode.Range(
            lineIdx,
            node.target.loc?.startChar ?? 0,
            lineIdx,
            node.target.loc?.endChar ?? 0,
          );
          const diag = new vscode.Diagnostic(
            range,
            resolvedLhs.isConst
              ? `Tentativa de atribuir valor à constante "${resolvedLhs.name}".`
              : `Tentativa de atribuir valor ao campo ReadOnly "${resolvedLhs.name}" fora do construtor.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.ReadOnlyAssignment;
          context.report(diag);
        }
      }

      // Validação de atribuição inválida a método
      const isMethod =
        resolvedLhs.kind === "method" ||
        resolvedLhs.kind === "declare_function" ||
        resolvedLhs.kind === "declare_sub";
      if (isMethod && !isCurrentFunctionReturnTarget) {
        const range = new vscode.Range(
          lineIdx,
          node.target.loc?.startChar ?? 0,
          lineIdx,
          node.target.loc?.endChar ?? 0,
        );
        const diag = new vscode.Diagnostic(
          range,
          `Tentativa de atribuir valor a um símbolo inválido (nome de outro método/função "${resolvedLhs.name}").`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.InvalidAssignmentTarget;
        context.report(diag);
      }
    }

    if (
      lhsType &&
      rhsType &&
      rhsType.toLowerCase() !== "void" &&
      lhsType.toLowerCase() !== "void" &&
      !this.isLambdaAssignedToDelegate(lhsType, node.value, context)
    ) {
      if (!DiagnosticsLinter.isTypeCompatible(rhsType, lhsType, context.indexer)) {
        const range = new vscode.Range(
          lineIdx,
          node.value.loc?.startChar ?? 0,
          lineIdx,
          node.value.loc?.endChar ?? 0,
        );
        const diag = new vscode.Diagnostic(
          range,
          `Incompatibilidade de tipos: não é possível atribuir "${rhsType}" para "${lhsType}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.TypeMismatch;
        context.report(diag);
      }
    }
  }

  private checkEventSignatureMismatch(
    node: Assignment,
    lineIdx: number,
    context: RuleContext,
  ): void {
    if (node.target.kind !== "MemberAccess") return;
    const eventName = node.target.member;

    const targetType = TypeResolver.resolveExpressionType(
      node.target.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType) return;

    const eventMember = TypeResolver.findMember(targetType, eventName, context.indexer);
    if (!eventMember) return;
    if (
      !eventName.toLowerCase().startsWith("on") &&
      !this.isDelegateType(eventMember.type, context)
    ) {
      return;
    }

    const delegateName = eventMember.type;
    const delegate =
      lookupSystemByName(delegateName).find((s) => s.kind === "delegate") ??
      context.indexer.findSymbolByName(delegateName);
    if (delegate?.kind !== "delegate" || !delegate.parameters) return;

    const handlerName = this.getAssignedHandlerName(node.value);
    if (!handlerName) return;

    const handler = context.indexer.findSymbolByName(handlerName);
    if (
      !handler ||
      (handler.kind !== "method" &&
        handler.kind !== "declare_sub" &&
        handler.kind !== "declare_function")
    ) {
      return;
    }

    const handlerParams = handler.parameters ?? [];
    if (handlerParams.length === delegate.parameters.length) return;

    const assignmentLoc = node.loc;
    if (!assignmentLoc) return;
    const startChar = node.value.loc ? node.value.loc.startChar : assignmentLoc.startChar;
    const endChar = node.value.loc ? node.value.loc.endChar : assignmentLoc.endChar;
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Assinatura incompativel: o evento "${eventName}" espera ${delegate.parameters.length} parametro(s) (delegate "${delegateName}"), mas o handler "${handlerName}" tem ${handlerParams.length}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.EventSignatureMismatch;
    context.report(diag);
  }

  private checkLambdaAssignment(node: Assignment, lineIdx: number, context: RuleContext): void {
    if (node.value.kind !== "ArrowFunctionExpression") return;
    if (node.target.kind !== "MemberAccess") return;

    const targetType = TypeResolver.resolveExpressionType(
      node.target.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType) return;

    const eventMember = TypeResolver.findMember(targetType, node.target.member, context.indexer);
    if (!eventMember || !this.isDelegateType(eventMember.type, context)) return;

    this.validateLambdaAgainstDelegate(
      node.value,
      eventMember.type,
      context,
      lineIdx,
      `atribuição ao membro "${node.target.member}"`,
      targetType,
      { requireExactParameterCount: true },
    );
  }

  private checkLambdaArguments(node: MethodInvocation, context: RuleContext): void {
    if (!node.loc || !node.arguments.some((arg) => arg.kind === "ArrowFunctionExpression")) return;
    const lineIdx = node.loc.startLine - 1;
    const resolved = this.resolveInvocationForLambda(node, context, lineIdx);
    if (!resolved?.symbol.parameters) return;

    for (let i = 0; i < node.arguments.length; i++) {
      const arg = node.arguments[i];
      if (arg?.kind !== "ArrowFunctionExpression") continue;
      const param = resolved.symbol.parameters[i];
      if (!param || !this.isDelegateType(param.type, context)) continue;
      this.validateLambdaAgainstDelegate(
        arg,
        param.type,
        context,
        lineIdx,
        `parÃ¢metro "${param.name}" de "${node.methodName}"`,
        resolved.receiverType,
      );
    }
  }

  private resolveInvocationForLambda(
    node: MethodInvocation,
    context: RuleContext,
    lineIdx: number,
  ): { readonly symbol: SymbolInfo; readonly receiverType?: string } | undefined {
    const argumentTypes = node.arguments.map((arg) =>
      arg.kind === "ArrowFunctionExpression"
        ? undefined
        : TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
    );

    if (node.callee) {
      const calleeText = exprToString(node.callee)?.toLowerCase() ?? "";
      let receiverType: string | undefined;
      if (calleeText === "me") {
        receiverType = context.activeClass?.name;
      } else if (calleeText === "mybase") {
        receiverType = context.activeClass?.baseType?.name ?? "TObject";
      } else {
        receiverType = TypeResolver.resolveExpressionType(
          node.callee,
          context.document,
          lineIdx,
          context.indexer,
        );
      }
      if (!receiverType) return undefined;
      const symbol =
        TypeResolver.findMemberWithArgumentTypes(
          receiverType,
          node.methodName,
          context.indexer,
          argumentTypes,
        ) ??
        TypeResolver.findMember(
          receiverType,
          node.methodName,
          context.indexer,
          node.arguments.length,
        );
      return symbol ? { symbol, receiverType } : undefined;
    }

    let symbol: SymbolInfo | undefined;
    if (context.activeClass) {
      symbol = TypeResolver.findMember(
        context.activeClass.name,
        node.methodName,
        context.indexer,
        node.arguments.length,
      );
    }
    symbol ??= TypeResolver.findUnqualifiedCallable(
      node.methodName,
      context.document,
      lineIdx,
      context.indexer,
      argumentTypes,
    );
    return symbol ? { symbol, receiverType: context.activeClass?.name } : undefined;
  }

  private validateLambdaAgainstDelegate(
    lambda: ArrowFunctionExpression,
    delegateType: string,
    context: RuleContext,
    lineIdx: number,
    usageLabel: string,
    receiverType?: string,
    options: { readonly requireExactParameterCount?: boolean } = {},
  ): void {
    const resolvedDelegate = this.resolveDelegateSignature(delegateType, receiverType, context);
    if (!resolvedDelegate) return;

    const expectedKind = resolvedDelegate.returnType.toLowerCase() === "void" ? "Sub" : "Function";
    const actualKind = lambda.lambdaKind ?? (lambda.returnType ? "Function" : "Function");
    if (actualKind !== expectedKind) {
      this.reportLambdaMismatch(
        lambda,
        lineIdx,
        context,
        `Assinatura de lambda incompatível em ${usageLabel}: esperado ${expectedKind}, mas recebido ${actualKind}.`,
      );
      return;
    }

    if (
      options.requireExactParameterCount &&
      lambda.parameters.length !== resolvedDelegate.parameters.length
    ) {
      this.reportLambdaMismatch(
        lambda,
        lineIdx,
        context,
        `Assinatura de lambda incompatível em ${usageLabel}: o delegate "${resolvedDelegate.name}" exige ${resolvedDelegate.parameters.length} parÃƒÂ¢metro(s), mas a lambda declarou ${lambda.parameters.length}.`,
      );
      return;
    }

    if (lambda.parameters.length > resolvedDelegate.parameters.length) {
      this.reportLambdaMismatch(
        lambda,
        lineIdx,
        context,
        `Assinatura de lambda incompatível em ${usageLabel}: o delegate "${resolvedDelegate.name}" aceita no máximo ${resolvedDelegate.parameters.length} parÃ¢metro(s), mas a lambda declarou ${lambda.parameters.length}.`,
      );
      return;
    }

    for (let i = 0; i < lambda.parameters.length; i++) {
      const actual = lambda.parameters[i];
      const expected = resolvedDelegate.parameters[i];
      if (!actual || !expected) continue;
      const actualType = typeRefToString(actual.type) ?? "Variant";
      if (actualType.toLowerCase() === "variant") continue;
      if (!DiagnosticsLinter.isTypeCompatible(actualType, expected.type, context.indexer)) {
        this.reportLambdaMismatch(
          actual,
          lineIdx,
          context,
          `Tipo incompatível no parÃ¢metro "${actual.name}" da lambda em ${usageLabel}: esperado "${expected.type}", mas recebido "${actualType}".`,
        );
        return;
      }
    }

    if (expectedKind === "Function") {
      const explicitReturn = typeRefToString(lambda.returnType);
      if (
        explicitReturn &&
        !DiagnosticsLinter.isTypeCompatible(
          explicitReturn,
          resolvedDelegate.returnType,
          context.indexer,
        )
      ) {
        this.reportLambdaMismatch(
          lambda.returnType ?? lambda,
          lineIdx,
          context,
          `Retorno incompatível na lambda em ${usageLabel}: o delegate "${resolvedDelegate.name}" espera "${resolvedDelegate.returnType}", mas a lambda declarou "${explicitReturn}".`,
        );
        return;
      }

      const returnedTypes = this.collectLambdaReturnTypes(lambda, context, lineIdx);
      if (returnedTypes.length === 0) {
        this.reportLambdaMismatch(
          lambda,
          lineIdx,
          context,
          `Retorno ausente na lambda em ${usageLabel}: o delegate "${resolvedDelegate.name}" retorna "${resolvedDelegate.returnType}".`,
        );
        return;
      }
      for (const returnedType of returnedTypes) {
        if (
          returnedType &&
          !DiagnosticsLinter.isTypeCompatible(
            returnedType,
            resolvedDelegate.returnType,
            context.indexer,
          )
        ) {
          this.reportLambdaMismatch(
            lambda,
            lineIdx,
            context,
            `Retorno incompatível na lambda em ${usageLabel}: esperado "${resolvedDelegate.returnType}", mas recebido "${returnedType}".`,
          );
          return;
        }
      }
    } else if (this.subLambdaReturnsValue(lambda)) {
      this.reportLambdaMismatch(
        lambda,
        lineIdx,
        context,
        `Lambda Sub em ${usageLabel} não pode retornar valor.`,
      );
    }
  }

  private resolveDelegateSignature(
    delegateType: string,
    receiverType: string | undefined,
    context: RuleContext,
  ):
    | {
        readonly name: string;
        readonly returnType: string;
        readonly parameters: readonly { readonly name: string; readonly type: string }[];
      }
    | undefined {
    const delegateRef = parseGenericTypeName(delegateType);
    const delegate =
      context.indexer.findSymbolByName(delegateRef.name, context.document.uri.toString()) ??
      context.indexer.findSymbolByName(delegateRef.name) ??
      lookupSystemByName(delegateRef.name).find((s) => s.kind === "delegate");
    if (delegate?.kind !== "delegate") return undefined;

    const substitutions = new Map<string, string>();
    const receiverRef = receiverType ? parseGenericTypeName(receiverType) : undefined;
    if (receiverRef) {
      const receiverSymbol = TypeResolver.findClassSymbol(receiverRef.name, context.indexer);
      receiverSymbol?.genericTypeParameters?.forEach((param, idx) => {
        const arg = receiverRef.typeArguments[idx];
        if (arg) substitutions.set(param.toLowerCase(), arg);
      });
    }
    delegate.genericTypeParameters?.forEach((param, idx) => {
      const arg = delegateRef.typeArguments[idx];
      if (arg) substitutions.set(param.toLowerCase(), substituteGenericType(arg, substitutions));
    });

    return {
      name: delegate.name,
      returnType: substituteGenericType(delegate.type, substitutions),
      parameters: (delegate.parameters ?? []).map((param) => ({
        name: param.name,
        type: substituteGenericType(param.type, substitutions),
      })),
    };
  }

  private collectLambdaReturnTypes(
    lambda: ArrowFunctionExpression,
    context: RuleContext,
    lineIdx: number,
  ): string[] {
    if (!Array.isArray(lambda.body)) {
      const type = TypeResolver.resolveExpressionType(
        lambda.body,
        context.document,
        lineIdx,
        context.indexer,
      );
      return [type ?? "Variant"];
    }
    const result: string[] = [];
    const visit = (statements: readonly Statement[]): void => {
      for (const statement of statements) {
        switch (statement.kind) {
          case "ReturnStatement":
            result.push(
              statement.expression
                ? (TypeResolver.resolveExpressionType(
                    statement.expression,
                    context.document,
                    Math.max(0, (statement.loc?.startLine ?? lineIdx + 1) - 1),
                    context.indexer,
                  ) ?? "Variant")
                : "Void",
            );
            break;
          case "IfStatement":
            visit(statement.thenBranch);
            for (const branch of statement.elseIfBranches) visit(branch.body);
            if (statement.elseBranch) visit(statement.elseBranch);
            break;
          case "WhileStatement":
          case "ForStatement":
          case "ForEachStatement":
          case "WithStatement":
          case "Block":
            visit(statement.kind === "Block" ? statement.statements : statement.body);
            break;
          case "TryCatchStatement":
            visit(statement.tryBody);
            visit(statement.catchBody);
            if (statement.finallyBody) visit(statement.finallyBody);
            break;
          case "UsingStatement":
            visit(statement.body);
            break;
          case "SelectCaseStatement":
            for (const c of statement.cases) visit(c.body);
            break;
        }
      }
    };
    visit(lambda.body);
    return result;
  }

  private subLambdaReturnsValue(lambda: ArrowFunctionExpression): boolean {
    if (!Array.isArray(lambda.body)) return false;
    const visit = (statements: readonly Statement[]): boolean => {
      for (const statement of statements) {
        switch (statement.kind) {
          case "ReturnStatement":
            if (statement.expression) return true;
            break;
          case "IfStatement":
            if (visit(statement.thenBranch)) return true;
            for (const branch of statement.elseIfBranches) {
              if (visit(branch.body)) return true;
            }
            if (statement.elseBranch && visit(statement.elseBranch)) return true;
            break;
          case "WhileStatement":
          case "ForStatement":
          case "ForEachStatement":
          case "WithStatement":
          case "Block":
            if (visit(statement.kind === "Block" ? statement.statements : statement.body)) {
              return true;
            }
            break;
          case "TryCatchStatement":
            if (
              visit(statement.tryBody) ||
              visit(statement.catchBody) ||
              (statement.finallyBody ? visit(statement.finallyBody) : false)
            ) {
              return true;
            }
            break;
          case "UsingStatement":
            if (visit(statement.body)) return true;
            break;
          case "SelectCaseStatement":
            for (const c of statement.cases) {
              if (visit(c.body)) return true;
            }
            break;
        }
      }
      return false;
    };
    return visit(lambda.body);
  }

  private reportLambdaMismatch(
    node: {
      readonly loc?: {
        readonly startLine: number;
        readonly startChar: number;
        readonly endLine: number;
        readonly endChar: number;
      };
    },
    fallbackLineIdx: number,
    context: RuleContext,
    message: string,
  ): void {
    const range = node.loc
      ? new vscode.Range(
          node.loc.startLine - 1,
          node.loc.startChar,
          node.loc.endLine - 1,
          node.loc.endChar,
        )
      : new vscode.Range(fallbackLineIdx, 0, fallbackLineIdx, 1);
    const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
    diag.code = DiagnosticCodes.LambdaSignatureMismatch;
    context.report(diag);
  }

  private getAssignedHandlerName(value: Expression): string {
    if (
      value.kind === "MethodInvocation" &&
      value.methodName.toLowerCase() === "addressof" &&
      value.arguments.length === 1
    ) {
      const handlerArg = value.arguments[0];
      if (handlerArg?.kind === "Identifier") return handlerArg.name;
      if (handlerArg?.kind === "MemberAccess") return handlerArg.member;
      return "";
    }
    if (value.kind === "MethodInvocation" && value.noParentheses) return value.methodName;
    if (value.kind === "Identifier") return value.name;
    if (value.kind === "MemberAccess") return value.member;
    return "";
  }

  private isDelegateType(typeName: string, context: RuleContext): boolean {
    return (
      context.indexer.findSymbolByName(typeName)?.kind === "delegate" ||
      lookupSystemByName(typeName).some((symbol) => symbol.kind === "delegate")
    );
  }

  private isLambdaAssignedToDelegate(
    targetType: string,
    value: Expression,
    context: RuleContext,
  ): boolean {
    return value.kind === "ArrowFunctionExpression" && this.isDelegateType(targetType, context);
  }

  private checkClassMustOverride(node: ClassDeclaration, context: RuleContext): void {
    if (!node.baseType) return;

    const baseClassName = node.baseType.name;
    const baseClassSyms = context.indexer.getSymbolsByName(baseClassName);
    const baseClass = baseClassSyms.find((s) => s.kind === "class");
    if (!baseClass) return;

    // Busca por métodos abstratos na classe base
    const baseClassMembers = context.indexer.getSymbolsByContainer(baseClassName);
    const abstractMethods = baseClassMembers.filter(
      (m) => m.kind === "method" && !!m.isMustOverride,
    );

    const declaredMethodNames = new Set(
      node.members.filter((m) => m.kind === "MethodDeclaration").map((m) => m.name.toLowerCase()),
    );

    for (const method of abstractMethods) {
      if (!declaredMethodNames.has(method.name.toLowerCase())) {
        const range = node.loc
          ? new vscode.Range(
              node.loc.startLine - 1,
              node.loc.startChar,
              node.loc.startLine - 1,
              node.loc.endChar,
            )
          : new vscode.Range(0, 0, 0, 1);
        const diag = new vscode.Diagnostic(
          range,
          `Classe concreta "${node.name}" deve implementar o método abstrato "${method.name}" herdado de "${baseClassName}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.MustOverrideNotImplemented;
        context.report(diag);
      }
    }
  }

  private checkOverrideDeclarations(node: ClassDeclaration, context: RuleContext): void {
    if (!node.baseType) return;

    const baseClassName = node.baseType.name;
    const baseClass = TypeResolver.findClassSymbol(baseClassName, context.indexer);
    if (!baseClass) return;

    for (const member of node.members) {
      if (member.kind !== "MethodDeclaration" && member.kind !== "PropertyDeclaration") continue;
      if (!(member.modifiers ?? []).includes("overrides")) continue;

      const arity =
        member.kind === "MethodDeclaration"
          ? member.parameters.length
          : (member.parameters?.length ?? 0);
      const inherited = TypeResolver.findMemberOnClassSymbol(
        baseClass,
        member.name,
        context.indexer,
        arity,
      );
      if (inherited && inherited.isOverridable) continue;

      this.reportInvalidOverride(member, baseClassName, inherited, context);
    }
  }

  private reportInvalidOverride(
    member: MethodDeclaration | PropertyDeclaration,
    baseClassName: string,
    inherited: SymbolInfo | undefined,
    context: RuleContext,
  ): void {
    const range = member.loc
      ? new vscode.Range(
          member.loc.startLine - 1,
          member.loc.startChar,
          member.loc.startLine - 1,
          member.loc.endChar,
        )
      : new vscode.Range(0, 0, 0, 1);
    const reason = inherited
      ? `o membro herdado em "${baseClassName}" nao é Overridable`
      : `nenhum membro compatível foi encontrado em "${baseClassName}"`;
    const diag = new vscode.Diagnostic(
      range,
      `Declaração Overrides inválida para "${member.name}": ${reason}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.InvalidDeclaration;
    context.report(diag);
  }

  private checkClassModifiers(node: ClassDeclaration, context: RuleContext): void {
    if (!node.loc) return;
    const modifiers = new Set((node.modifiers ?? []).map((m) => m.toLowerCase()));
    const lineIdx = node.loc.startLine - 1;

    if (modifiers.has("mustinherit") && modifiers.has("notinheritable")) {
      const diag = new vscode.Diagnostic(
        new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar),
        `A classe "${node.name}" nao pode combinar MustInherit e NotInheritable.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.InvalidClassModifierCombination;
      context.report(diag);
    }

    if (!node.baseType) return;
    const baseSymbol = TypeResolver.findClassSymbol(node.baseType.name, context.indexer);
    if (!baseSymbol?.isNotInheritable) return;

    const lineText = context.lines[lineIdx] ?? "";
    const startChar = findTextColumn(lineText, node.baseType.name, node.loc.startChar);
    const diag = new vscode.Diagnostic(
      new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.baseType.name.length),
      `A classe "${node.baseType.name}" esta marcada como NotInheritable e nao pode ser herdada.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.SealedInheritance;
    context.report(diag);
  }

  private isCurrentReturnAssignmentTarget(node: Assignment, context: RuleContext): boolean {
    if (node.target.kind !== "Identifier") return false;
    const targetName = node.target.name.toLowerCase();
    const activeMethodName =
      context.activeMethod?.returnType !== undefined ? context.activeMethod.name.toLowerCase() : "";
    const activePropertyName = context.activeProperty?.name.toLowerCase() ?? "";
    return targetName === activeMethodName || targetName === activePropertyName;
  }
}

function parseGenericTypeName(typeName: string): {
  readonly name: string;
  readonly typeArguments: string[];
} {
  const trimmed = typeName.trim();
  const lt = trimmed.indexOf("<");
  if (lt < 0 || !trimmed.endsWith(">")) return { name: trimmed, typeArguments: [] };
  return {
    name: trimmed.slice(0, lt).trim(),
    typeArguments: splitGenericArguments(trimmed.slice(lt + 1, -1)),
  };
}

function splitGenericArguments(value: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "<") depth++;
    if (ch === ">") depth--;
    if (ch === "," && depth === 0) {
      const item = current.trim();
      if (item) result.push(item);
      current = "";
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) result.push(tail);
  return result;
}

function substituteGenericType(
  typeName: string,
  substitutions: ReadonlyMap<string, string>,
): string {
  const parsed = parseGenericTypeName(typeName);
  const direct = substitutions.get(parsed.name.toLowerCase());
  if (direct && parsed.typeArguments.length === 0) return direct;
  if (parsed.typeArguments.length === 0) return direct ?? parsed.name;
  const args = parsed.typeArguments.map((arg) => substituteGenericType(arg, substitutions));
  return `${direct ?? parsed.name}<${args.join(", ")}>`;
}

function findTextColumn(lineText: string, text: string, fallback: number): number {
  const idx = lineText.toLowerCase().indexOf(text.toLowerCase());
  return idx >= 0 ? idx : fallback;
}
