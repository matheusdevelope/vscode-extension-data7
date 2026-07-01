import * as vscode from "../../platform/vscode-api";
import type {
  Node,
  TypeReference,
  VariableDeclaration,
  Assignment,
  ClassDeclaration,
  ObjectCreationExpression,
  Expression,
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
        this.checkClassMustOverride(node, context);
        break;
      case "ObjectCreationExpression":
        this.checkObjectCreationExpression(node, context);
        break;
    }
  }

  private checkObjectCreationExpression(
    node: ObjectCreationExpression,
    context: RuleContext,
  ): void {
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
      lhsType.toLowerCase() !== "void"
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

  private checkClassMustOverride(node: ClassDeclaration, context: RuleContext): void {
    const modifiers = node.modifiers ?? [];
    const isAbstract = modifiers.some((m) => m.toLowerCase() === "mustinherit");
    if (isAbstract || !node.baseType) return;

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
        diag.code = "must-override-missing";
        context.report(diag);
      }
    }
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
