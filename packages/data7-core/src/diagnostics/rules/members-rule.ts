import * as vscode from "../../platform/vscode-api";
import type {
  Node,
  MemberAccess,
  MethodInvocation,
  Expression,
  Assignment,
  ExpressionStatement,
  VariableDeclaration,
} from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type {
  CallParenthesesMismatchPayload,
  ChainedInstantiationAccessPayload,
} from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";
import { TypeResolver } from "../../analysis/type-resolver";
import { getOrBuildWithScopeIndex } from "../../analysis/with-scope-index";
import { LanguageProcessor } from "../../analysis/language-processor";
import { DiagnosticsLinter } from "../diagnostics";
import { SymbolInfo } from "../../analysis/symbol-indexer";
import {
  attachUnknownMemberSuggestions,
  exprToString,
  inheritsFromClass,
  isQualifiedTypeInvocation,
  isSymbolContainerAccessible,
} from "../diagnostic-helpers";
import { lookupSystemByName, lookupSystemClassByName, SYSTEM_SYMBOLS } from "../../system-library";
import { PRIMITIVE_TYPES } from "../../utils/primitive-types";

const SYSTEM_SYMBOL_NAMES = new Set(SYSTEM_SYMBOLS.map((s) => s.name.toLowerCase()));

const MEMBERS_RULE_NODE_KINDS = new Set<Node["kind"]>([
  "MemberAccess",
  "MethodInvocation",
  "Assignment",
  "VariableDeclaration",
  "ExpressionStatement",
  "Identifier",
]);

export class MembersRule implements Rule {
  public readonly name = "members";
  public readonly supportedNodeKinds = MEMBERS_RULE_NODE_KINDS;

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    if (node.kind === "MemberAccess") {
      this.checkMemberAccess(node, context, parent);
    } else if (node.kind === "MethodInvocation") {
      this.checkMethodInvocation(node, context, parent);
    } else if (node.kind === "Assignment") {
      this.checkAssignment(node, context);
    } else if (node.kind === "VariableDeclaration") {
      this.checkVariableDeclaration(node, context);
    } else if (node.kind === "ExpressionStatement") {
      this.checkExpressionStatement(node, context);
    } else if (node.kind === "Identifier") {
      this.checkIdentifier(node, context, parent);
    }
  }

  private checkMemberAccess(
    node: MemberAccess,
    context: RuleContext,
    parent: Node | undefined,
  ): void {
    if (!node.loc) return;
    if (node.member.length === 0) return;
    const lineIdx = node.loc.startLine - 1;
    TypeResolver.runWithClassResolutionContext(context.document, lineIdx, context.indexer, () => {
      this.checkMemberAccessWithContext(node, context, parent, lineIdx);
    });
  }

  private checkMemberAccessWithContext(
    node: MemberAccess,
    context: RuleContext,
    parent: Node | undefined,
    lineIdx: number,
  ): void {
    const lineText = context.lines[lineIdx] ?? "";
    const memberRange = this.getMemberAccessMemberRange(node, lineIdx, lineText);
    const startChar = memberRange.start.character;

    if (node.target.kind === "ObjectCreationExpression") {
      this.pushChainedInstantiationAccessDiagnostic(node, node.target, context);
    }

    const prefixLower = exprToString(node.target)?.toLowerCase() ?? "";
    if (
      node.target.kind === "Identifier" &&
      context.isExternalTypeAllowed(node.target.name, lineIdx)
    ) {
      return;
    }

    if (prefixLower === "me" || prefixLower === "mybase") {
      if (context.activeClass) {
        const typeName =
          prefixLower === "me"
            ? context.activeClass.name
            : (context.activeClass.baseType?.name ?? "TObject");
        const resolved = TypeResolver.findMember(typeName, node.member, context.indexer);

        if (!resolved && !(node.member.toLowerCase() === "new" && prefixLower === "mybase")) {
          const diag = new vscode.Diagnostic(
            memberRange,
            `Membro "${node.member}" não encontrado na classe "${context.activeClass.name}".`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.UnknownMember;
          attachUnknownMemberSuggestions(
            diag,
            node.member,
            DiagnosticsLinter.collectMemberNames(context.activeClass.name, context.indexer),
          );
          context.report(diag);
        } else if (resolved?.isUnsupported) {
          DiagnosticsLinter.pushUnsupportedMemberDiagnostic(
            context.diagnostics,
            memberRange.start.line,
            startChar,
            node.member,
            context.activeClass.name,
          );
        }
      }
      return;
    }

    if (prefixLower.startsWith("vcl") || prefixLower.startsWith("system")) {
      return;
    }

    const lintUnit = LanguageProcessor.getInstance().getOrParse(
      context.document.uri.toString(),
      context.document.getText(),
    ).unit;
    let typeName = TypeResolver.resolveMemberAccessTargetType(
      node.target,
      context.document,
      lineIdx,
      context.indexer,
      lintUnit,
    );
    let isStaticAccess = false;
    const staticAccess = this.resolveStaticReceiverAccess(node.target, context);

    if (this.shouldTreatAsStaticReceiver(node.target, lineIdx, context, staticAccess)) {
      typeName = staticAccess.typeName;
      isStaticAccess = true;
    } else if (!typeName) {
      typeName = staticAccess.typeName;
      isStaticAccess = staticAccess.isStaticAccess;
    }

    if (typeName && this.isResolvableMemberContainer(typeName, context)) {
      const nativeArrayLengthType = TypeResolver.tryResolveNativeArrayLengthMemberAccess(
        node,
        context.document,
        lineIdx,
        context.indexer,
      );
      if (nativeArrayLengthType) {
        return;
      }
      const resolved = TypeResolver.findMember(typeName, node.member, context.indexer);
      if (
        !resolved &&
        !this.isAssignedEventHandlerReference(node, context) &&
        typeName.toLowerCase() !== "variant" &&
        typeName.toLowerCase() !== "tobject" &&
        typeName.toLowerCase() !== "void"
      ) {
        const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.member.length);
        const diag = new vscode.Diagnostic(
          range,
          `Membro "${node.member}" não encontrado na classe/tipo "${typeName}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.UnknownMember;
        attachUnknownMemberSuggestions(
          diag,
          node.member,
          DiagnosticsLinter.collectMemberNames(typeName, context.indexer),
        );
        context.report(diag);
      } else if (resolved?.isUnsupported) {
        DiagnosticsLinter.pushUnsupportedMemberDiagnostic(
          context.diagnostics,
          lineIdx,
          startChar,
          node.member,
          typeName,
        );
      } else if (
        resolved &&
        isStaticAccess &&
        !resolved.isShared &&
        resolved.kind !== "class" &&
        resolved.kind !== "structure" &&
        resolved.kind !== "delegate"
      ) {
        const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.member.length);
        const diag = new vscode.Diagnostic(
          range,
          `Acesso a membro de instância "${node.member}" diretamente no tipo "${typeName}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.InstanceMemberAccessOnType;
        context.report(diag);
      } else if (resolved?.isPrivate || resolved?.isProtected) {
        let hasAccess = false;
        if (context.activeClass && resolved.containerName) {
          const ownerLower = resolved.containerName.toLowerCase();
          const enclosingLower = context.activeClass.name.toLowerCase();
          if (ownerLower === enclosingLower) {
            hasAccess = true;
          } else if (resolved.isProtected) {
            if (
              inheritsFromClass(context.activeClass.name, resolved.containerName, context.indexer)
            ) {
              hasAccess = true;
            }
          }
        }
        if (!hasAccess) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.member.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            resolved.isPrivate
              ? `O membro "${node.member}" de "${typeName}" é Private e não pode ser acessado fora da classe.`
              : `O membro "${node.member}" de "${typeName}" é Protected e só pode ser acessado na classe declarante ou suas subclasses.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.PrivateMemberAccess;
          context.report(diag);
        }
      }
    } else if (typeName && this.shouldReportUnknownReceiverType(typeName, lineIdx, context)) {
      if (!this.isProjectGlobalVariableReceiver(node.target, context)) {
        this.pushUnknownReceiverTypeDiagnostic(node.member, typeName, memberRange, context);
      }
    }

    const isAddressOf =
      parent && parent.kind === "UnaryExpression" && parent.operator.toLowerCase() === "addressof";
    const isAssignmentTarget = parent && parent.kind === "Assignment" && parent.target === node;

    if (
      parent &&
      !(parent.kind === "MethodInvocation" && parent.callee === node) &&
      !isAddressOf &&
      !isAssignmentTarget
    ) {
      const parameterlessCallable = this.resolveParameterlessFinalCall(node, lineIdx, context);
      if (parameterlessCallable) {
        this.pushFinalCallParenthesesDiagnostic(node, parameterlessCallable, lineIdx, context);
      }
    }
  }

  private checkMethodInvocation(
    node: MethodInvocation,
    context: RuleContext,
    parent: Node | undefined,
  ): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    TypeResolver.runWithClassResolutionContext(context.document, lineIdx, context.indexer, () => {
      this.checkMethodInvocationWithContext(node, context, parent, lineIdx);
    });
  }

  private checkMethodInvocationWithContext(
    node: MethodInvocation,
    context: RuleContext,
    parent: Node | undefined,
    lineIdx: number,
  ): void {
    if (!node.loc) return;
    const lineText = context.lines[lineIdx] ?? "";
    const dotIndex = node.callee ? lineText.indexOf(".", node.loc.startChar) : -1;
    const startChar = dotIndex !== -1 ? dotIndex + 1 : node.loc.startChar;

    const arity = node.arguments.length;
    let resolvedMethod: SymbolInfo | undefined;
    let resolvedDelegateVariable: SymbolInfo | undefined;

    if (node.callee?.kind === "ObjectCreationExpression") {
      this.pushChainedInstantiationAccessDiagnostic(node, node.callee, context);
    }

    if (node.callee) {
      const prefixLower = exprToString(node.callee)?.toLowerCase() ?? "";
      let isStaticAccess = false;
      let typeName: string | undefined;
      if (
        node.callee.kind === "Identifier" &&
        context.isExternalTypeAllowed(node.callee.name, lineIdx)
      ) {
        return;
      }
      if (node.methodName.length === 0) {
        const calleeType = TypeResolver.resolveExpressionType(
          node.callee,
          context.document,
          lineIdx,
          context.indexer,
        );
        if (calleeType && this.resolveDelegateSignature(calleeType, context)) {
          resolvedDelegateVariable = {
            name: calleeType,
            kind: "variable",
            type: calleeType,
            isShared: false,
            isPrivate: false,
            range: {
              startLine: lineIdx,
              startChar,
              endLine: lineIdx,
              endChar: startChar,
            },
            fileUri: context.document.uri.toString(),
          };
        }
      }
      if (prefixLower === "me") {
        typeName = context.activeClass?.name;
      } else if (prefixLower === "mybase") {
        typeName = context.activeClass?.baseType?.name ?? "TObject";
      } else {
        typeName = TypeResolver.resolveExpressionType(
          node.callee,
          context.document,
          lineIdx,
          context.indexer,
        );
        const staticAccess = this.resolveStaticReceiverAccess(node.callee, context);
        if (this.shouldTreatAsStaticReceiver(node.callee, lineIdx, context, staticAccess)) {
          typeName = staticAccess.typeName;
          isStaticAccess = true;
        } else if (!typeName) {
          typeName = staticAccess.typeName;
          isStaticAccess = staticAccess.isStaticAccess;
        }
      }

      if (typeName) {
        const argumentTypes = node.arguments.map((arg) =>
          TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
        );
        resolvedMethod =
          TypeResolver.findMemberWithArgumentTypes(
            typeName,
            node.methodName,
            context.indexer,
            argumentTypes,
          ) ?? TypeResolver.findMember(typeName, node.methodName, context.indexer, arity);

        if (
          resolvedMethod?.kind === "variable" &&
          resolvedMethod.nativeArrayRank !== undefined &&
          resolvedMethod.nativeArrayRank === arity
        ) {
          return;
        }

        if (this.isResolvableMemberContainer(typeName, context)) {
          const exists =
            resolvedMethod ?? TypeResolver.findMember(typeName, node.methodName, context.indexer);
          if (
            !exists &&
            node.methodName.length > 0 &&
            typeName.toLowerCase() !== "variant" &&
            typeName.toLowerCase() !== "tobject" &&
            typeName.toLowerCase() !== "void"
          ) {
            const range = new vscode.Range(
              lineIdx,
              startChar,
              lineIdx,
              startChar + node.methodName.length,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Membro "${node.methodName}" não encontrado na classe/tipo "${typeName}".`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.UnknownMember;
            attachUnknownMemberSuggestions(
              diag,
              node.methodName,
              DiagnosticsLinter.collectMemberNames(typeName, context.indexer),
            );
            context.report(diag);
          } else if (
            exists &&
            this.isCallableSymbol(exists) &&
            !this.hasCallableArityMatch(typeName, node.methodName, arity, context)
          ) {
            this.pushInvocationArityDiagnostic(node, lineIdx, startChar, context);
          } else if (
            exists &&
            isStaticAccess &&
            !exists.isShared &&
            exists.kind !== "class" &&
            exists.kind !== "structure" &&
            exists.kind !== "delegate"
          ) {
            const range = new vscode.Range(
              lineIdx,
              startChar,
              lineIdx,
              startChar + node.methodName.length,
            );
            const diag = new vscode.Diagnostic(
              range,
              `Acesso a membro de instância "${node.methodName}" diretamente no tipo "${typeName}".`,
              vscode.DiagnosticSeverity.Error,
            );
            diag.code = DiagnosticCodes.InstanceMemberAccessOnType;
            context.report(diag);
          }
        } else if (this.shouldReportUnknownReceiverType(typeName, lineIdx, context)) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.methodName.length,
          );
          this.pushUnknownReceiverTypeDiagnostic(node.methodName, typeName, range, context);
        }
      }
    } else {
      const argumentTypes = node.arguments.map((arg) =>
        TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
      );
      // Prefer default-indexer interpretation for `list(i)` before treating the
      // name as a free function — class fields and locals share the same syntax.
      const variableType = TypeResolver.getVariableType(
        node.methodName,
        context.document,
        new vscode.Position(lineIdx, startChar),
        context.indexer,
      );
      if (variableType && this.resolveDelegateSignature(variableType, context)) {
        resolvedDelegateVariable = {
          name: node.methodName,
          kind: "variable",
          type: variableType,
          isShared: false,
          isPrivate: false,
          range: {
            startLine: lineIdx,
            startChar,
            endLine: lineIdx,
            endChar: startChar + node.methodName.length,
          },
          fileUri: context.document.uri.toString(),
        };
      } else if (variableType) {
        // Parentheses default-indexer: `_arquivos(i)` ≡ `_arquivos.Item(i)` / Strings(i).
        const defaultIndexer = TypeResolver.findMember(
          variableType,
          "Item",
          context.indexer,
          arity,
        );
        if (defaultIndexer?.kind === "indexed-property") {
          this.checkMethodArgumentTypes(node, defaultIndexer, lineIdx, context);
          return;
        }
      }

      if (!resolvedDelegateVariable) {
        resolvedMethod = TypeResolver.findUnqualifiedCallable(
          node.methodName,
          context.document,
          lineIdx,
          context.indexer,
          argumentTypes,
          undefined,
          node.loc?.startChar,
        );
        if (!resolvedMethod && context.activeClass) {
          const classMember = TypeResolver.findMember(
            context.activeClass.name,
            node.methodName,
            context.indexer,
          );
          if (classMember && this.isCallableSymbol(classMember)) {
            resolvedMethod = classMember;
          }
        }
      }
    }

    if (resolvedDelegateVariable) {
      if (
        this.checkDelegateInvocation(node, resolvedDelegateVariable, lineIdx, startChar, context)
      ) {
        return;
      }
    }

    if (resolvedMethod) {
      if (this.isAssignedEventHandlerReference(node, context)) {
        return;
      }

      if (this.checkDelegateInvocation(node, resolvedMethod, lineIdx, startChar, context)) {
        return;
      }

      const paramCount = resolvedMethod.parameters ? resolvedMethod.parameters.length : 0;
      const isSub = resolvedMethod.type.toLowerCase() === "void";

      if (node.noParentheses) {
        let hasMismatch = false;
        if (isSub) {
          if (paramCount > 1) hasMismatch = true;
        } else {
          if (paramCount >= 1) hasMismatch = true;
        }

        if (hasMismatch) {
          const range = new vscode.Range(
            lineIdx,
            startChar,
            lineIdx,
            startChar + node.methodName.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Chamada do método "${node.methodName}" viola as regras de parênteses. Métodos ${isSub ? "Sub (Void) com mais de 1 parâmetro" : "Function (com retorno) com 1 ou mais parâmetros"} exigem o uso de parênteses.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.CallParenthesesMismatch;
          context.report(diag);
        } else if (node.arguments.length > 0) {
          this.pushNoParenthesesCallStyleDiagnostic(node, lineIdx, startChar, context);
        }
      }
      if (
        isSub &&
        parent &&
        parent.kind !== "ExpressionStatement" &&
        parent.kind !== "ArrowFunctionExpression"
      ) {
        const range = new vscode.Range(
          lineIdx,
          startChar,
          lineIdx,
          startChar + node.methodName.length,
        );
        const diag = new vscode.Diagnostic(
          range,
          `O método Sub "${node.methodName}" retorna Void e não pode ser usado em uma expressão ou atribuição.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.SubUsedAsFunction;
        context.report(diag);
      }

      this.checkMethodArgumentTypes(node, resolvedMethod, lineIdx, context);
    } else if (!node.callee && this.shouldReportUnresolvedInvocation(node, lineIdx, context)) {
      const range = new vscode.Range(
        lineIdx,
        startChar,
        lineIdx,
        startChar + node.methodName.length,
      );
      const missingNamespace = this.findMissingImportForCallable(node.methodName, lineIdx, context);
      if (missingNamespace) {
        const diag = new vscode.Diagnostic(
          range,
          `O método ou função "${node.methodName}" pertence ao módulo "${missingNamespace}", que não foi importado neste arquivo.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.MissingImport;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.MissingImport,
          namespace: missingNamespace,
          typeName: node.methodName,
        });
        context.report(diag);
        return;
      }
      const diag = new vscode.Diagnostic(
        range,
        `O método ou função "${node.methodName}" não foi encontrado no escopo atual.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.UnknownSymbol;
      context.report(diag);
    }
  }

  private resolveActiveNamespaceName(lineIdx: number, context: RuleContext): string | undefined {
    if (context.activeNamespace) {
      return context.activeNamespace;
    }
    const fileSymbols = context.indexer.getFileSymbols(context.document.uri.toString());
    return fileSymbols?.symbols
      .filter(
        (symbol) =>
          symbol.kind === "namespace" &&
          lineIdx >= symbol.range.startLine &&
          lineIdx <= symbol.range.endLine,
      )
      .sort((left, right) => right.range.startLine - left.range.startLine)[0]?.name;
  }

  private findMissingImportForCallable(
    methodName: string,
    lineIdx: number,
    context: RuleContext,
  ): string | undefined {
    const fileSymbols = context.indexer.getFileSymbols(context.document.uri.toString());
    const imports = new Set((fileSymbols?.imports ?? []).map((item) => item.toLowerCase()));
    const activeNamespace = this.resolveActiveNamespaceName(lineIdx, context);

    const candidate = context.indexer.getSymbolsByName(methodName).find((symbol) => {
      if (
        symbol.kind !== "method" &&
        symbol.kind !== "declare_sub" &&
        symbol.kind !== "declare_function"
      ) {
        return false;
      }
      const container = symbol.containerName;
      if (!container) return false;
      if (
        isSymbolContainerAccessible(container, {
          activeNamespace,
          activeClassNesting: context.activeClassNesting,
          imports,
        })
      ) {
        return false;
      }
      return context.indexer.getSymbolsByName(container).some((item) => item.kind === "namespace");
    });

    return candidate?.containerName;
  }

  private checkDelegateInvocation(
    node: MethodInvocation,
    symbol: SymbolInfo,
    lineIdx: number,
    startChar: number,
    context: RuleContext,
  ): boolean {
    return TypeResolver.runWithClassResolutionContext(
      context.document,
      lineIdx,
      context.indexer,
      () => this.checkDelegateInvocationScoped(node, symbol, lineIdx, startChar, context),
    );
  }

  private checkDelegateInvocationScoped(
    node: MethodInvocation,
    symbol: SymbolInfo,
    lineIdx: number,
    startChar: number,
    context: RuleContext,
  ): boolean {
    if (symbol.kind !== "variable" && symbol.kind !== "property") return false;
    const delegateSignature = this.resolveDelegateSignature(symbol.type, context);
    if (!delegateSignature) return false;

    const expectedParams = delegateSignature.parameters;
    if (!this.isArityMatch(expectedParams, node.arguments.length)) {
      const range = new vscode.Range(
        lineIdx,
        startChar,
        lineIdx,
        startChar + node.methodName.length,
      );
      const diag = new vscode.Diagnostic(
        range,
        `Chamada do delegate "${symbol.name}" espera ${expectedParams.length} argumento(s), mas recebeu ${node.arguments.length}.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.TypeMismatch;
      context.report(diag);
      return true;
    }

    for (let i = 0; i < node.arguments.length; i++) {
      const argument = node.arguments[i];
      const parameter = expectedParams[i];
      if (!argument || !parameter) continue;
      const argumentType = TypeResolver.resolveExpressionType(
        argument,
        context.document,
        Math.max(0, (argument.loc?.startLine ?? lineIdx + 1) - 1),
        context.indexer,
      );
      if (!argumentType) continue;
      if (DiagnosticsLinter.isTypeCompatible(argumentType, parameter.type, context.indexer)) {
        continue;
      }
      const range = argument.loc
        ? new vscode.Range(
            argument.loc.startLine - 1,
            argument.loc.startChar,
            argument.loc.endLine - 1,
            argument.loc.endChar,
          )
        : new vscode.Range(lineIdx, node.loc?.startChar ?? 0, lineIdx, node.loc?.endChar ?? 1);
      const diag = new vscode.Diagnostic(
        range,
        `Incompatibilidade de tipos no argumento "${parameter.name}" de "${symbol.name}": esperado "${parameter.type}", mas recebido "${argumentType}".`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.TypeMismatch;
      context.report(diag);
    }
    return true;
  }

  private shouldReportUnresolvedInvocation(
    node: MethodInvocation,
    lineIdx: number,
    context: RuleContext,
  ): boolean {
    if (node.methodName.length === 0) return false;
    if (context.isExternalTypeAllowed(node.methodName, lineIdx)) return false;
    const lower = node.methodName.toLowerCase();
    if (
      lower === "new" ||
      lower === "ctype" ||
      lower === "typeof" ||
      PRIMITIVE_TYPES.has(lower) ||
      DiagnosticsLinter.isKnownType(node.methodName, context.indexer) ||
      context.activeClass?.typeParameters?.some((param) => param.name.toLowerCase() === lower)
    ) {
      return false;
    }
    return true;
  }

  private checkMethodArgumentTypes(
    node: MethodInvocation,
    method: SymbolInfo,
    lineIdx: number,
    context: RuleContext,
  ): void {
    TypeResolver.runWithClassResolutionContext(context.document, lineIdx, context.indexer, () =>
      this.checkMethodArgumentTypesScoped(node, method, lineIdx, context),
    );
  }

  private checkMethodArgumentTypesScoped(
    node: MethodInvocation,
    method: SymbolInfo,
    lineIdx: number,
    context: RuleContext,
  ): void {
    const argumentTypes = node.arguments.map((arg) =>
      TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
    );
    const signatures = [method.parameters, ...(method.overloads ?? [])].filter(
      (parameters): parameters is NonNullable<SymbolInfo["parameters"]> =>
        !!parameters && this.isArityMatch(parameters, argumentTypes.length),
    );
    if (signatures.length === 0) return;
    const genericSubstitutions = this.buildMethodGenericSubstitutions(method, node);

    const acceptsAnySignature = signatures.some((parameters) =>
      parameters.every((parameter, index) => {
        const expectedType = this.substituteMethodGenericType(parameter.type, genericSubstitutions);
        const argument = node.arguments[index];
        if (argument?.kind === "ArrowFunctionExpression") {
          return this.isDelegateType(expectedType, context);
        }
        const delegateHandlerMatch = argument
          ? this.getDelegateHandlerReferenceCompatibility(argument, expectedType, lineIdx, context)
          : undefined;
        if (delegateHandlerMatch !== undefined) return delegateHandlerMatch;
        const argumentType = argumentTypes[index];
        if (!argumentType) return true;
        return DiagnosticsLinter.isTypeCompatible(argumentType, expectedType, context.indexer);
      }),
    );
    if (acceptsAnySignature) return;

    const signature = signatures[0];
    if (!signature) return;
    for (let i = 0; i < node.arguments.length; i++) {
      const argument = node.arguments[i];
      const argumentType = argumentTypes[i];
      const parameter = signature[i];
      if (!argument || !argumentType || !parameter) continue;
      const expectedType = this.substituteMethodGenericType(parameter.type, genericSubstitutions);
      if (
        argument.kind === "ArrowFunctionExpression" &&
        this.isDelegateType(expectedType, context)
      ) {
        continue;
      }
      if (
        this.getDelegateHandlerReferenceCompatibility(argument, expectedType, lineIdx, context) ===
        true
      ) {
        continue;
      }
      if (DiagnosticsLinter.isTypeCompatible(argumentType, expectedType, context.indexer)) {
        continue;
      }

      const range = argument.loc
        ? new vscode.Range(
            argument.loc.startLine - 1,
            argument.loc.startChar,
            argument.loc.endLine - 1,
            argument.loc.endChar,
          )
        : new vscode.Range(lineIdx, node.loc?.startChar ?? 0, lineIdx, node.loc?.endChar ?? 1);
      const diag = new vscode.Diagnostic(
        range,
        `Incompatibilidade de tipos no argumento "${parameter.name}" de "${method.name}": esperado "${expectedType}", mas recebido "${argumentType}".`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.TypeMismatch;
      context.report(diag);
    }
  }

  private isArityMatch(
    parameters: readonly {
      readonly isOptional?: boolean;
      readonly defaultValue?: string;
    }[],
    argumentCount: number,
  ): boolean {
    if (argumentCount > parameters.length) return false;
    for (let i = argumentCount; i < parameters.length; i++) {
      const parameter = parameters[i];
      if (parameter && !parameter.isOptional && parameter.defaultValue === undefined) {
        return false;
      }
    }
    return true;
  }

  private buildMethodGenericSubstitutions(
    method: SymbolInfo,
    node: MethodInvocation,
  ): ReadonlyMap<string, string> {
    const substitutions = new Map<string, string>();
    method.genericTypeParameters?.forEach((parameter, index) => {
      const argument = node.typeArguments[index];
      if (argument?.name) {
        substitutions.set(parameter.toLowerCase(), argument.name);
      }
    });
    return substitutions;
  }

  private substituteMethodGenericType(
    typeName: string,
    substitutions: ReadonlyMap<string, string>,
  ): string {
    return substitutions.get(typeName.toLowerCase()) ?? typeName;
  }

  private isDelegateType(typeName: string, context: RuleContext): boolean {
    const baseName = typeName.split("<", 1)[0] ?? typeName;
    const lower = baseName.toLowerCase();
    return (
      context.indexer.findSymbolByName(baseName)?.kind === "delegate" ||
      lookupSystemByName(baseName).some((symbol) => symbol.kind === "delegate") ||
      context.indexer
        .getAllSymbols()
        .some(
          (symbol) =>
            symbol.kind === "delegate" && lower.startsWith(`${symbol.name.toLowerCase()}_`),
        ) ||
      SYSTEM_SYMBOLS.filter((symbol) => symbol.kind === "delegate").some((symbol) =>
        lower.startsWith(`${symbol.name.toLowerCase()}_`),
      )
    );
  }

  private getDelegateHandlerReferenceCompatibility(
    argument: Expression,
    expectedType: string,
    lineIdx: number,
    context: RuleContext,
  ): boolean | undefined {
    if (!this.isDelegateType(expectedType, context)) return undefined;
    const handler = this.resolveDelegateHandlerReference(argument, lineIdx, context);
    if (!handler) return undefined;
    const delegateSignature = this.resolveDelegateSignature(expectedType, context);
    if (!delegateSignature) return undefined;
    return this.isHandlerCompatibleWithDelegate(handler, delegateSignature, context);
  }

  private resolveDelegateHandlerReference(
    argument: Expression,
    lineIdx: number,
    context: RuleContext,
  ): SymbolInfo | undefined {
    if (argument.kind === "Identifier") {
      const activeClassMember = context.activeClass
        ? TypeResolver.findMember(context.activeClass.name, argument.name, context.indexer)
        : undefined;
      return this.asCallableSymbol(
        activeClassMember ??
          TypeResolver.findUnqualifiedCallable(
            argument.name,
            context.document,
            lineIdx,
            context.indexer,
          ),
      );
    }

    if (argument.kind !== "MemberAccess") return undefined;

    let receiverType = TypeResolver.resolveExpressionType(
      argument.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!receiverType) {
      receiverType = this.resolveStaticReceiverAccess(argument.target, context).typeName;
    }
    if (!receiverType) {
      const receiverText = exprToString(argument.target);
      if (receiverText && DiagnosticsLinter.isKnownMemberContainer(receiverText, context.indexer)) {
        receiverType = receiverText;
      }
    }
    if (!receiverType) return undefined;
    return this.asCallableSymbol(
      TypeResolver.findMember(receiverType, argument.member, context.indexer),
    );
  }

  private asCallableSymbol(symbol: SymbolInfo | undefined): SymbolInfo | undefined {
    if (
      symbol?.kind === "method" ||
      symbol?.kind === "declare_function" ||
      symbol?.kind === "declare_sub"
    ) {
      return symbol;
    }
    return undefined;
  }

  private resolveDelegateSignature(
    delegateType: string,
    context: RuleContext,
  ):
    | {
        readonly name: string;
        readonly returnType: string;
        readonly parameters: readonly {
          readonly name: string;
          readonly type: string;
          readonly isOptional?: boolean;
          readonly defaultValue?: string;
        }[];
      }
    | undefined {
    const delegateRef = parseGenericTypeName(delegateType);
    let delegate = TypeResolver.findDelegateSymbol(delegateRef.name, context.indexer);
    let typeArguments: readonly string[] = delegateRef.typeArguments;
    if (delegate?.kind !== "delegate") {
      const flatDelegate = this.resolveFlatGenericDelegate(delegateRef.name, context);
      delegate = flatDelegate?.delegate;
      typeArguments = flatDelegate?.typeArguments ?? [];
    }
    if (delegate?.kind !== "delegate") return undefined;

    const substitutions = new Map<string, string>();
    delegate.genericTypeParameters?.forEach((param, idx) => {
      const arg = typeArguments[idx];
      if (arg) substitutions.set(param.toLowerCase(), substituteGenericType(arg, substitutions));
    });

    return {
      name: delegate.name,
      returnType: substituteGenericType(delegate.type, substitutions),
      parameters: (delegate.parameters ?? []).map((param) => ({
        name: param.name,
        type: substituteGenericType(param.type, substitutions),
        isOptional: param.isOptional,
        defaultValue: param.defaultValue,
      })),
    };
  }

  private resolveFlatGenericDelegate(
    delegateType: string,
    context: RuleContext,
  ):
    | {
        readonly delegate: SymbolInfo;
        readonly typeArguments: readonly string[];
      }
    | undefined {
    const lower = delegateType.toLowerCase();
    const candidates = [
      ...context.indexer.getAllSymbols(),
      ...SYSTEM_SYMBOLS.filter((symbol) => symbol.kind === "delegate"),
    ];
    for (const symbol of candidates) {
      if (symbol.kind !== "delegate" || !symbol.genericTypeParameters?.length) continue;
      const prefix = `${symbol.name.toLowerCase()}_`;
      if (!lower.startsWith(prefix)) continue;
      const rawArgs = delegateType.slice(symbol.name.length + 1);
      const typeArguments = rawArgs.split("_").filter((arg) => arg.length > 0);
      if (typeArguments.length === 0) continue;
      return { delegate: symbol, typeArguments };
    }
    return undefined;
  }

  private isHandlerCompatibleWithDelegate(
    handler: SymbolInfo,
    delegateSignature: {
      readonly returnType: string;
      readonly parameters: readonly {
        readonly type: string;
      }[];
    },
    context: RuleContext,
  ): boolean {
    const handlerParams = handler.parameters ?? [];
    if (handlerParams.length !== delegateSignature.parameters.length) return false;

    for (let i = 0; i < delegateSignature.parameters.length; i++) {
      const expected = delegateSignature.parameters[i];
      const actual = handlerParams[i];
      if (!expected || !actual) return false;
      if (!DiagnosticsLinter.isTypeCompatible(actual.type, expected.type, context.indexer)) {
        return false;
      }
    }

    const expectedReturn = delegateSignature.returnType;
    if (expectedReturn.toLowerCase() === "void") {
      return handler.type.toLowerCase() === "void";
    }
    return DiagnosticsLinter.isTypeCompatible(handler.type, expectedReturn, context.indexer);
  }

  private checkAssignment(node: Assignment, context: RuleContext): void {
    if (!node.loc) return;
    if (this.isAssignedEventHandlerReference(node.value, context)) return;
    if (node.value.kind !== "Identifier") return;

    const lineIdx = node.loc.startLine - 1;
    const parameterlessCallable = this.resolveParameterlessFinalCall(node.value, lineIdx, context);
    if (parameterlessCallable) {
      this.pushFinalCallParenthesesDiagnostic(node.value, parameterlessCallable, lineIdx, context);
    }
  }

  private checkVariableDeclaration(node: VariableDeclaration, context: RuleContext): void {
    if (!node.loc || !node.initializer || node.initializer.kind !== "Identifier") return;

    const lineIdx = node.loc.startLine - 1;
    const parameterlessCallable = this.resolveParameterlessFinalCall(
      node.initializer,
      lineIdx,
      context,
    );
    if (parameterlessCallable) {
      this.pushFinalCallParenthesesDiagnostic(
        node.initializer,
        parameterlessCallable,
        lineIdx,
        context,
      );
    }
  }

  private checkExpressionStatement(node: ExpressionStatement, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const expr = node.expression;

    if (
      expr.kind === "MemberAccess" &&
      expr.target.kind === "Identifier" &&
      expr.target.name &&
      this.tryReportWithRelativeNoParenCall(expr, lineIdx, context)
    ) {
      return;
    }

    if (expr.kind === "Identifier" || expr.kind === "MemberAccess") {
      const parameterlessCallable = this.resolveParameterlessFinalCall(expr, lineIdx, context);
      if (parameterlessCallable) {
        this.pushFinalCallParenthesesDiagnostic(expr, parameterlessCallable, lineIdx, context);
        return;
      }
    }

    let isLooseType = false;
    let typeName = "";
    if (expr.kind === "Identifier") {
      if (
        PRIMITIVE_TYPES.has(expr.name.toLowerCase()) ||
        DiagnosticsLinter.isKnownType(expr.name, context.indexer)
      ) {
        isLooseType = true;
        typeName = expr.name;
      }
    } else if (expr.kind === "MemberAccess") {
      const fullPath = exprToString(expr);
      if (fullPath && DiagnosticsLinter.isKnownType(fullPath, context.indexer)) {
        isLooseType = true;
        typeName = fullPath;
      }
    }

    if (isLooseType) {
      const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
      const diag = new vscode.Diagnostic(
        range,
        `Nome de tipo avulso "${typeName}" não é permitido como instrução standalone.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.LooseTypeStatement;
      context.report(diag);
      return;
    }

    if (expr.kind === "MemberAccess") {
      const standaloneValue = this.resolveStandaloneValueMember(expr, lineIdx, context);
      if (standaloneValue) {
        const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
        const diag = new vscode.Diagnostic(
          range,
          `Acesso ao valor "${standaloneValue.name}" não pode ficar solto como instrução; use-o em atribuição, expressão ou chamada.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.LooseValueStatement;
        context.report(diag);
        return;
      }

      const target = expr.target;
      if (target.kind === "Identifier" && PRIMITIVE_TYPES.has(target.name.toLowerCase())) {
        const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
        const diag = new vscode.Diagnostic(
          range,
          `O tipo primitivo "${target.name}" não possui membros estáticos acessí­veis. Acesso ".${expr.member}" é inválido.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.LooseTypeStatement;
        context.report(diag);
      }
      return;
    }

    if (expr.kind === "MethodInvocation" && expr.callee?.kind === "Identifier") {
      const calleeName = expr.callee.name;
      if (PRIMITIVE_TYPES.has(calleeName.toLowerCase())) {
        const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
        const diag = new vscode.Diagnostic(
          range,
          `O tipo primitivo "${calleeName}" não possui membros estáticos acessí­veis. Acesso ".${expr.methodName}" é inválido.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.LooseTypeStatement;
        context.report(diag);
      }
    }
  }

  private checkIdentifier(
    node: Extract<Node, { kind: "Identifier" }>,
    context: RuleContext,
    parent: Node | undefined,
  ): void {
    if (!node.name || !node.loc) return;
    const name = node.name;
    const nameLower = name.toLowerCase();

    let shouldSkip =
      PRIMITIVE_TYPES.has(nameLower) ||
      context.isExternalTypeAllowed(name, node.loc.startLine - 1) ||
      nameLower === "variant" ||
      nameLower === "tobject" ||
      nameLower === "void" ||
      nameLower === "true" ||
      nameLower === "false" ||
      nameLower === "null" ||
      nameLower === "nothing" ||
      nameLower === "me" ||
      nameLower === "mybase" ||
      nameLower === "value" ||
      nameLower === "addressof" ||
      nameLower === "unassigned";

    if (parent) {
      if (parent.kind === "TypeReference") shouldSkip = true;
      if (parent.kind === "MemberAccess" && parent.member === name) shouldSkip = true;
      if (parent.kind === "MethodInvocation" && parent.methodName === name) shouldSkip = true;
      if (
        parent.kind === "MethodInvocation" &&
        parent.callee === node &&
        isQualifiedTypeInvocation(parent, context.indexer)
      ) {
        shouldSkip = true;
      }
      if (
        parent.kind === "MethodInvocation" &&
        parent.methodName.toLowerCase() === "ctype" &&
        parent.arguments[1] === node
      ) {
        shouldSkip = true;
      }
      if (
        (parent.kind === "ClassDeclaration" && parent.name === name) ||
        (parent.kind === "MethodDeclaration" && parent.name === name) ||
        (parent.kind === "DelegateDeclaration" && parent.name === name) ||
        (parent.kind === "PropertyDeclaration" && parent.name === name) ||
        (parent.kind === "FieldDeclaration" && parent.name === name) ||
        (parent.kind === "VariableDeclaration" && parent.name === name) ||
        (parent.kind === "ParameterDeclaration" && parent.name === name)
      ) {
        shouldSkip = true;
      }
      if (
        parent.kind === "MemberAccess" &&
        parent.target === node &&
        this.isProjectGlobalVariable(name, context)
      ) {
        shouldSkip = true;
      }
      // Qualified `Namespace.Member` — namespaces are visible without Imports.
      if (
        parent.kind === "MemberAccess" &&
        parent.target === node &&
        this.isNamespaceSymbol(name, context)
      ) {
        shouldSkip = true;
      }
    }

    if (shouldSkip) return;

    const lineIdx = node.loc.startLine - 1;
    const isDeclared =
      nameLower === context.activeMethod?.name.toLowerCase() ||
      nameLower === context.activeProperty?.name.toLowerCase() ||
      context.isLocalDeclared(name) ||
      context.isGenericTypeParameter(name) ||
      this.isProjectGlobalVariable(name, context) ||
      this.isNamespaceSymbol(name, context) ||
      TypeResolver.hasVariableInScope(
        name,
        context.document,
        new vscode.Position(lineIdx, node.loc.startChar),
        context.indexer,
      ) ||
      !!(
        context.activeClass &&
        ((context.activeClassInheritedNames?.has(nameLower) ?? false) ||
          TypeResolver.findMember(context.activeClass.name, name, context.indexer) !== undefined)
      ) ||
      (this.getMissingImportNamespaceForSymbol(name, lineIdx, context) === undefined &&
        (this.isWorkspaceSymbolAccessibleFromLine(name, lineIdx, context) ||
          SYSTEM_SYMBOL_NAMES.has(nameLower)));

    if (isDeclared) return;

    const missingNamespace = this.getMissingImportNamespaceForSymbol(name, lineIdx, context);
    const range = new vscode.Range(
      node.loc.startLine - 1,
      node.loc.startChar,
      node.loc.endLine - 1,
      node.loc.endChar,
    );

    if (missingNamespace) {
      const diag = new vscode.Diagnostic(
        range,
        `O tipo ou classe "${name}" pertence ao módulo "${missingNamespace}", que não foi importado neste arquivo.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.MissingImport;
      setDiagnosticPayload(diag, {
        code: DiagnosticCodes.MissingImport,
        namespace: missingNamespace,
        typeName: name,
      });
      context.report(diag);
      return;
    }

    const diag = new vscode.Diagnostic(
      range,
      `O símbolo "${name}" não foi encontrado no escopo atual.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.UnknownSymbol;
    context.report(diag);
  }

  private resolveStaticReceiverAccess(
    receiver: Expression,
    context: RuleContext,
  ): {
    readonly typeName: string | undefined;
    readonly isStaticAccess: boolean;
  } {
    if (receiver.kind !== "Identifier") {
      return { typeName: undefined, isStaticAccess: false };
    }

    const workspaceSymbol = context.indexer.findSymbolByName(
      receiver.name,
      context.document.uri.toString(),
    );
    if (
      workspaceSymbol &&
      (workspaceSymbol.kind === "class" ||
        workspaceSymbol.kind === "structure" ||
        workspaceSymbol.kind === "namespace")
    ) {
      return {
        typeName: workspaceSymbol.name,
        isStaticAccess: workspaceSymbol.kind === "class" || workspaceSymbol.kind === "structure",
      };
    }

    const systemSymbol = lookupSystemByName(receiver.name).find(
      (s) => s.kind === "namespace" || s.kind === "class" || s.kind === "structure",
    );
    if (!systemSymbol) {
      return { typeName: undefined, isStaticAccess: false };
    }

    return {
      typeName: systemSymbol.name,
      isStaticAccess: systemSymbol.kind === "class" || systemSymbol.kind === "structure",
    };
  }

  private shouldTreatAsStaticReceiver(
    receiver: Expression,
    lineIdx: number,
    context: RuleContext,
    staticAccess: {
      readonly typeName: string | undefined;
      readonly isStaticAccess: boolean;
    },
  ): boolean {
    if (!staticAccess.isStaticAccess || receiver.kind !== "Identifier") return false;
    // Instance bindings (Dim / param / field) win over a homonymous type name
    // (e.g. field `grid As Forms.Grid` vs system class `Grid`).
    if (
      TypeResolver.hasVariableInScope(
        receiver.name,
        context.document,
        new vscode.Position(lineIdx, 0),
        context.indexer,
      )
    ) {
      return false;
    }
    return !TypeResolver.hasLocalDimDeclaration(
      receiver.name,
      context.document,
      lineIdx,
      context.indexer,
    );
  }

  private getMissingImportNamespaceForSymbol(
    name: string,
    lineIdx: number,
    context: RuleContext,
  ): string | undefined {
    // A workspace namespace of this exact name is always addressable as
    // `Name.Member` without Imports — do not confuse it with a homonymous
    // private field whose container happens to look like a module.
    if (this.isNamespaceSymbol(name, context)) {
      return undefined;
    }

    const wsSymbols = context.indexer.getSymbolsByName(name).filter((s) => {
      if (
        s.kind === "class" ||
        s.kind === "structure" ||
        s.kind === "delegate" ||
        s.kind === "enum"
      ) {
        return true;
      }
      // Namespace-scoped Dim/Const only — class fields must not trigger missing-import.
      return s.kind === "variable" && s.isShared && !s.isPrivate;
    });

    const sysSymbols = lookupSystemByName(name).filter(
      (s) =>
        s.kind === "class" ||
        s.kind === "structure" ||
        s.kind === "delegate" ||
        s.kind === "enum" ||
        (s.kind === "variable" && s.isShared && !s.isPrivate),
    );

    const allMatches = [...wsSymbols, ...sysSymbols];
    if (allMatches.length === 0) {
      return undefined;
    }

    const fileSymbols = context.indexer.getFileSymbols(context.document.uri.toString());
    const imports = new Set((fileSymbols?.imports ?? []).map((item) => item.toLowerCase()));
    const activeNamespace = this.resolveActiveNamespaceName(lineIdx, context);

    const hasAccessibleMatch = allMatches.some((symbol) =>
      isSymbolContainerAccessible(symbol.containerName, {
        activeNamespace,
        activeClassNesting: context.activeClassNesting,
        imports,
      }),
    );

    if (hasAccessibleMatch) {
      return undefined;
    }

    return allMatches[0]?.containerName;
  }

  private isNamespaceSymbol(name: string, context: RuleContext): boolean {
    return context.indexer.getSymbolsByName(name).some((symbol) => symbol.kind === "namespace");
  }

  private isWorkspaceSymbolAccessibleFromLine(
    name: string,
    lineIdx: number,
    context: RuleContext,
  ): boolean {
    const fileSymbols = context.indexer.getFileSymbols(context.document.uri.toString());
    const imports = new Set((fileSymbols?.imports ?? []).map((item) => item.toLowerCase()));
    const activeNamespace = this.resolveActiveNamespaceName(lineIdx, context);

    return context.indexer.getSymbolsByName(name).some((symbol) => {
      if (
        symbol.kind === "namespace" ||
        symbol.kind === "class" ||
        symbol.kind === "structure" ||
        symbol.kind === "enum" ||
        symbol.kind === "delegate"
      ) {
        return isSymbolContainerAccessible(symbol.containerName, {
          activeNamespace,
          activeClassNesting: context.activeClassNesting,
          imports,
        });
      }

      if (
        symbol.kind === "variable" ||
        symbol.kind === "method" ||
        symbol.kind === "property" ||
        symbol.kind === "indexed-property"
      ) {
        return isSymbolContainerAccessible(symbol.containerName, {
          activeNamespace,
          activeClassNesting: context.activeClassNesting,
          imports,
        });
      }

      return false;
    });
  }

  private isProjectGlobalVariableReceiver(receiver: Expression, context: RuleContext): boolean {
    return receiver.kind === "Identifier" && this.isProjectGlobalVariable(receiver.name, context);
  }

  private isProjectGlobalVariable(name: string, context: RuleContext): boolean {
    return context.indexer
      .getSymbolsByName(name)
      .some(
        (symbol) =>
          symbol.kind === "variable" &&
          symbol.containerName === undefined &&
          /(?:^|[/\\])principal\.bas$/i.test(symbol.fileUri),
      );
  }

  private pushChainedInstantiationAccessDiagnostic(
    node: MemberAccess | MethodInvocation,
    creation: Extract<Expression, { kind: "ObjectCreationExpression" }>,
    context: RuleContext,
  ): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Acesso encadeado direto em "New ${creation.type.name}()" não é permitido. Armazene a instância em uma variável antes de acessar membros.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.ChainedInstantiationAccess;
    const payload: ChainedInstantiationAccessPayload = {
      code: DiagnosticCodes.ChainedInstantiationAccess,
      typeName: creation.type.name,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private isCallableSymbol(symbol: SymbolInfo): boolean {
    return (
      symbol.kind === "method" ||
      symbol.kind === "declare_function" ||
      symbol.kind === "declare_sub"
    );
  }

  private hasCallableArityMatch(
    typeName: string,
    methodName: string,
    arity: number,
    context: RuleContext,
  ): boolean {
    return TypeResolver.getAllMembersForType(typeName, context.indexer)
      .filter((member) => member.name.toLowerCase() === methodName.toLowerCase())
      .some((member) =>
        [member.parameters, ...(member.overloads ?? [])].some((parameters) =>
          parameters === undefined ? arity === 0 : this.isArityMatch(parameters, arity),
        ),
      );
  }

  private pushInvocationArityDiagnostic(
    node: MethodInvocation,
    lineIdx: number,
    startChar: number,
    context: RuleContext,
  ): void {
    const range = new vscode.Range(lineIdx, startChar, lineIdx, startChar + node.methodName.length);
    const diag = new vscode.Diagnostic(
      range,
      `Chamada de "${node.methodName}" não corresponde a nenhuma assinatura disponível. Verifique a quantidade de argumentos obrigatórios e opcionais.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    // No quick-fix payload: arity mismatches are not fixable by inserting "()".
    // Attaching insertColumn here previously made Code Actions rewrite
    // `foo(arg)` into `foo()(arg)` on save / fix-all.
    context.report(diag);
  }

  private isResolvableMemberContainer(typeName: string, context: RuleContext): boolean {
    if (DiagnosticsLinter.isKnownMemberContainer(typeName, context.indexer)) {
      return true;
    }
    if (TypeResolver.findClassSymbol(typeName, context.indexer) !== undefined) {
      return true;
    }
    return lookupSystemClassByName(typeName).length > 0;
  }

  private shouldReportUnknownReceiverType(
    typeName: string,
    lineIdx: number,
    context: RuleContext,
  ): boolean {
    const lower = typeName.toLowerCase();
    return (
      lower !== "variant" &&
      lower !== "tobject" &&
      lower !== "void" &&
      !PRIMITIVE_TYPES.has(lower) &&
      !context.isGenericTypeParameter(typeName) &&
      !context.isExternalTypeAllowed(typeName, lineIdx) &&
      !this.isResolvableMemberContainer(typeName, context)
    );
  }

  private pushUnknownReceiverTypeDiagnostic(
    memberName: string,
    typeName: string,
    range: vscode.Range,
    context: RuleContext,
  ): void {
    const diag = new vscode.Diagnostic(
      range,
      `Membro "${memberName}" não pode ser resolvido porque o tipo "${typeName}" não foi encontrado ou não está acessí­vel neste escopo.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.UnknownMember;
    context.report(diag);
  }

  private resolveParameterlessFinalCall(
    expr: Expression,
    lineIdx: number,
    context: RuleContext,
  ): SymbolInfo | undefined {
    if (expr.kind === "Identifier") {
      if (
        PRIMITIVE_TYPES.has(expr.name.toLowerCase()) ||
        DiagnosticsLinter.isKnownType(expr.name, context.indexer)
      ) {
        return undefined;
      }
      if (
        TypeResolver.hasLocalDimDeclaration(expr.name, context.document, lineIdx, context.indexer)
      ) {
        return undefined;
      }
      const resolved = TypeResolver.findUnqualifiedCallable(
        expr.name,
        context.document,
        lineIdx,
        context.indexer,
        [],
      );
      return this.isParameterlessCallable(resolved) ? resolved : undefined;
    }

    if (expr.kind !== "MemberAccess") return undefined;

    if (expr.target.kind === "Identifier" && expr.target.name) {
      const namespaceMember = TypeResolver.findMember(
        expr.target.name,
        expr.member,
        context.indexer,
        0,
      );
      if (this.isParameterlessCallable(namespaceMember)) {
        return namespaceMember;
      }
    }

    const targetType = TypeResolver.resolveExpressionType(
      expr.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType) return undefined;
    const resolved = TypeResolver.findMember(targetType, expr.member, context.indexer, 0);
    return this.isParameterlessCallable(resolved) ? resolved : undefined;
  }

  private isParameterlessCallable(symbol: SymbolInfo | undefined): symbol is SymbolInfo {
    if (!symbol) return false;
    if (
      symbol.kind !== "method" &&
      symbol.kind !== "declare_function" &&
      symbol.kind !== "declare_sub"
    ) {
      return false;
    }
    return (symbol.parameters?.length ?? 0) === 0 || symbol.parameters!.every((p) => p.isOptional);
  }

  private pushFinalCallParenthesesDiagnostic(
    expr: Expression,
    symbol: SymbolInfo,
    lineIdx: number,
    context: RuleContext,
  ): void {
    const tokenName = expr.kind === "MemberAccess" ? expr.member : symbol.name;
    const lineText = context.lines[lineIdx] ?? "";
    const startChar =
      expr.kind === "MemberAccess" && expr.memberLoc
        ? expr.memberLoc.startChar
        : (expr.loc?.startChar ?? 0);
    const endChar = this.findTokenEnd(lineText, startChar, tokenName);
    const range = new vscode.Range(lineIdx, startChar, lineIdx, endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Chamada final do método "${symbol.name}" sem argumentos deve usar parênteses "()".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    const payload: CallParenthesesMismatchPayload = {
      code: DiagnosticCodes.CallParenthesesMismatch,
      line: lineIdx,
      insertColumn: endChar,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private pushNoParenthesesCallStyleDiagnostic(
    node: MethodInvocation,
    lineIdx: number,
    startChar: number,
    context: RuleContext,
  ): void {
    if (!node.loc) return;
    const lineText = context.lines[lineIdx] ?? "";
    const methodEnd = this.findTokenEnd(lineText, startChar, node.methodName);
    const codeEnd = this.findCodeEnd(lineText, methodEnd);
    if (codeEnd <= methodEnd) return;

    const range = new vscode.Range(lineIdx, startChar, lineIdx, methodEnd);
    const diag = new vscode.Diagnostic(
      range,
      `Chamada do método "${node.methodName}" sem parênteses é aceita pelo compilador, mas deve ser escrita como "${node.methodName}(...)".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    const payload: CallParenthesesMismatchPayload = {
      code: DiagnosticCodes.CallParenthesesMismatch,
      line: lineIdx,
      insertColumn: methodEnd,
      wrapRange: {
        startChar: methodEnd,
        endChar: codeEnd,
      },
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }

  private tryReportWithRelativeNoParenCall(
    expr: MemberAccess,
    lineIdx: number,
    context: RuleContext,
  ): boolean {
    if (expr.target.kind !== "Identifier" || !expr.target.name) {
      return false;
    }
    const calleeName = expr.target.name;
    const callable = TypeResolver.findUnqualifiedCallable(
      calleeName,
      context.document,
      lineIdx,
      context.indexer,
      [undefined],
    );
    if (!callable || !this.isCallableSymbol(callable)) {
      return false;
    }

    const unit = LanguageProcessor.getInstance().getOrParse(
      context.document.uri.toString(),
      context.document.getText(),
    ).unit;
    const withTarget = getOrBuildWithScopeIndex(unit).getInnermostTarget(lineIdx + 1);
    if (!withTarget) {
      return false;
    }
    const withType = TypeResolver.resolveExpressionType(
      withTarget,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!withType) {
      return false;
    }
    const withMember = TypeResolver.findMember(withType, expr.member, context.indexer);
    if (!withMember || this.isCallableSymbol(withMember)) {
      return false;
    }

    const lineText = context.lines[lineIdx] ?? "";
    const calleeStart = expr.target.loc?.startChar ?? expr.loc?.startChar ?? 0;
    const calleeEnd = this.findTokenEnd(lineText, calleeStart, calleeName);
    const memberStartChar = expr.memberLoc?.startChar ?? this.findMemberTokenStart(lineText, expr);
    const memberEndChar = this.resolveMemberEndChar(expr.memberLoc, expr.member, memberStartChar);
    const argumentStartChar = this.findLeadingDotArgumentStart(lineText, memberStartChar);
    const range = new vscode.Range(lineIdx, calleeStart, lineIdx, calleeEnd);
    const diag = new vscode.Diagnostic(
      range,
      `Chamada do método "${callable.name}" sem parênteses é aceita pelo compilador, mas deve ser escrita como "${callable.name}(...)".`,
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    const payload: CallParenthesesMismatchPayload = {
      code: DiagnosticCodes.CallParenthesesMismatch,
      line: lineIdx,
      insertColumn: calleeEnd,
      wrapRange: {
        startChar: argumentStartChar,
        endChar: memberEndChar,
      },
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
    return true;
  }

  private resolveStandaloneValueMember(
    expr: MemberAccess,
    lineIdx: number,
    context: RuleContext,
  ): Pick<SymbolInfo, "name"> | undefined {
    const unit = LanguageProcessor.getInstance().getOrParse(
      context.document.uri.toString(),
      context.document.getText(),
    ).unit;
    let targetType = TypeResolver.resolveExpressionType(
      expr.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType && expr.target.kind === "Identifier" && expr.target.name === "") {
      const withTarget = getOrBuildWithScopeIndex(unit).getInnermostTarget(lineIdx + 1);
      if (withTarget) {
        targetType = TypeResolver.resolveExpressionType(
          withTarget,
          context.document,
          lineIdx,
          context.indexer,
        );
      }
    }
    if (!targetType && expr.target.kind === "Identifier" && expr.target.name) {
      const qualified = TypeResolver.findMember(expr.target.name, expr.member, context.indexer);
      if (qualified) {
        if (
          qualified.kind === "method" ||
          qualified.kind === "declare_function" ||
          qualified.kind === "declare_sub"
        ) {
          return undefined;
        }
        return qualified;
      }
    }
    if (!targetType) {
      return expr.member.length > 0 ? { name: expr.member } : undefined;
    }
    const resolved = TypeResolver.findMember(targetType, expr.member, context.indexer);
    if (!resolved) {
      const lower = targetType.toLowerCase();
      if (
        lower !== "variant" &&
        lower !== "tobject" &&
        lower !== "void" &&
        this.isResolvableMemberContainer(targetType, context)
      ) {
        return undefined;
      }
      return expr.member.length > 0 ? { name: expr.member } : undefined;
    }
    if (
      resolved.kind === "method" ||
      resolved.kind === "declare_function" ||
      resolved.kind === "declare_sub"
    ) {
      return undefined;
    }
    return resolved;
  }

  private findCodeEnd(lineText: string, startChar: number): number {
    let inString = false;
    for (let i = startChar; i < lineText.length; i++) {
      const ch = lineText[i];
      if (ch === '"') {
        if (inString && lineText[i + 1] === '"') {
          i++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && ch === "'") {
        return trimEndColumn(lineText, i);
      }
    }
    return trimEndColumn(lineText, lineText.length);
  }

  private findTokenEnd(lineText: string, startChar: number, tokenName: string): number {
    const start = Math.max(0, startChar);
    const expectedEnd = start + tokenName.length;
    if (lineText.slice(start, expectedEnd).toLowerCase() === tokenName.toLowerCase()) {
      return expectedEnd;
    }
    let cursor = start;
    while (this.isIdentifierChar(lineText[cursor])) cursor++;
    return cursor > start ? cursor : expectedEnd;
  }

  private isIdentifierChar(char: string | undefined): boolean {
    return char !== undefined && /[A-Za-z0-9_]/.test(char);
  }

  private getMemberAccessMemberRange(
    node: MemberAccess,
    fallbackLineIdx: number,
    fallbackLineText: string,
  ): vscode.Range {
    if (node.memberLoc) {
      const lineIdx = Math.max(0, node.memberLoc.startLine - 1);
      const endChar = this.resolveMemberEndChar(
        node.memberLoc,
        node.member,
        node.memberLoc.startChar,
      );
      return new vscode.Range(lineIdx, node.memberLoc.startChar, lineIdx, endChar);
    }

    const startChar = this.findMemberTokenStart(fallbackLineText, node);
    return new vscode.Range(
      fallbackLineIdx,
      startChar,
      fallbackLineIdx,
      startChar + node.member.length,
    );
  }

  private resolveMemberEndChar(
    memberLoc: { readonly startChar: number; readonly endChar: number } | undefined,
    member: string,
    memberStartChar: number,
  ): number {
    if (memberLoc && memberLoc.endChar > memberLoc.startChar) {
      return memberLoc.endChar;
    }
    return memberStartChar + member.length;
  }

  private findLeadingDotArgumentStart(lineText: string, memberStartChar: number): number {
    let cursor = memberStartChar;
    while (cursor > 0 && /\s/.test(lineText[cursor - 1] ?? "")) {
      cursor--;
    }
    if (lineText[cursor - 1] === ".") {
      return cursor - 1;
    }
    return memberStartChar;
  }

  private findMemberTokenStart(lineText: string, node: MemberAccess): number {
    const member = node.member;
    if (member.length === 0) return node.loc?.startChar ?? 0;

    const lineLower = lineText.toLowerCase();
    const needle = `.${member.toLowerCase()}`;
    const startAt = Math.max(0, node.loc?.startChar ?? 0);
    let searchAt = startAt;
    let lastMatch = -1;

    while (searchAt < lineLower.length) {
      const match = lineLower.indexOf(needle, searchAt);
      if (match === -1) break;
      const afterMember = match + needle.length;
      if (!this.isIdentifierChar(lineText[afterMember])) {
        lastMatch = match + 1;
      }
      searchAt = match + 1;
    }

    if (lastMatch !== -1) return lastMatch;

    const dotIndex = lineText.indexOf(".", startAt);
    return dotIndex !== -1 ? dotIndex + 1 : startAt;
  }

  private isAssignedEventHandlerReference(node: Expression, context: RuleContext): boolean {
    const parent = context.parentStack[context.parentStack.length - 1];
    if (parent?.kind !== "Assignment" || parent.value !== node) return false;
    const target = parent.target;
    if (target.kind !== "MemberAccess") return false;
    if (target.member.toLowerCase().startsWith("on")) return true;

    if (!target.loc) return false;
    const lineIdx = target.loc.startLine - 1;
    const targetType = TypeResolver.resolveExpressionType(
      target.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType) return false;
    const eventMember = TypeResolver.findMember(targetType, target.member, context.indexer);
    if (!eventMember) return false;
    return (
      context.indexer.findSymbolByName(eventMember.type)?.kind === "delegate" ||
      lookupSystemByName(eventMember.type).some((symbol) => symbol.kind === "delegate")
    );
  }
}

function trimEndColumn(lineText: string, endExclusive: number): number {
  let cursor = Math.min(endExclusive, lineText.length);
  while (cursor > 0 && /\s/.test(lineText[cursor - 1] ?? "")) cursor--;
  return cursor;
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
