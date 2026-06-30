import * as vscode from "../../platform/vscode-api";
import type { Node, MemberAccess, MethodInvocation, Expression } from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type { CallParenthesesMismatchPayload } from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";
import { TypeResolver } from "../../analysis/type-resolver";
import { DiagnosticsLinter } from "../diagnostics";
import { SymbolInfo } from "../../analysis/symbol-indexer";
import {
  attachUnknownMemberSuggestions,
  exprToString,
  inheritsFromClass,
} from "../diagnostic-helpers";
import { lookupSystemByName } from "../../system-library";
import { PRIMITIVE_TYPES } from "../../utils/primitive-types";

export class MembersRule implements Rule {
  public readonly name = "members";

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    if (node.kind === "MemberAccess") {
      this.checkMemberAccess(node, context, parent);
    } else if (node.kind === "MethodInvocation") {
      this.checkMethodInvocation(node, context, parent);
    }
  }

  private checkMemberAccess(
    node: MemberAccess,
    context: RuleContext,
    parent: Node | undefined,
  ): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const lineText = context.lines[lineIdx] ?? "";
    const memberRange = this.getMemberAccessMemberRange(node, lineIdx, lineText);
    const startChar = memberRange.start.character;

    const prefixLower = exprToString(node.target)?.toLowerCase() ?? "";

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

    let typeName = TypeResolver.resolveExpressionType(
      node.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    let isStaticAccess = false;

    if (!typeName) {
      const staticAccess = this.resolveStaticReceiverAccess(node.target, context);
      typeName = staticAccess.typeName;
      isStaticAccess = staticAccess.isStaticAccess;
    }

    if (typeName && DiagnosticsLinter.isKnownMemberContainer(typeName, context.indexer)) {
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
    const lineText = context.lines[lineIdx] ?? "";
    const dotIndex = lineText.indexOf(".", node.loc.startChar);
    const startChar = dotIndex !== -1 ? dotIndex + 1 : node.loc.startChar;

    const arity = node.arguments.length;
    let resolvedMethod: SymbolInfo | undefined;

    if (node.callee) {
      const prefixLower = exprToString(node.callee)?.toLowerCase() ?? "";
      let isStaticAccess = false;
      let typeName: string | undefined;
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
        if (!typeName) {
          const staticAccess = this.resolveStaticReceiverAccess(node.callee, context);
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

        if (DiagnosticsLinter.isKnownMemberContainer(typeName, context.indexer)) {
          const exists =
            resolvedMethod ?? TypeResolver.findMember(typeName, node.methodName, context.indexer);
          if (
            !exists &&
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
        }
      }
    } else {
      const argumentTypes = node.arguments.map((arg) =>
        TypeResolver.resolveExpressionType(arg, context.document, lineIdx, context.indexer),
      );
      resolvedMethod = TypeResolver.findUnqualifiedCallable(
        node.methodName,
        context.document,
        lineIdx,
        context.indexer,
        argumentTypes,
      );
    }

    if (resolvedMethod) {
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
    }
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
      const endChar =
        node.memberLoc.endChar > node.memberLoc.startChar
          ? node.memberLoc.endChar
          : node.memberLoc.startChar + node.member.length;
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

  private isAssignedEventHandlerReference(node: MemberAccess, context: RuleContext): boolean {
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
