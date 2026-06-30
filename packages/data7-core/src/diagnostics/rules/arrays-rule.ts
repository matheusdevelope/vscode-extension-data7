import * as vscode from "../../platform/vscode-api";
import type { Node, ArrayAccessExpression, CompilationUnit } from "../../project/ast/ast";
import { DiagnosticCodes } from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";
import { TypeResolver } from "../../analysis/type-resolver";
import { DiagnosticsLinter } from "../diagnostics";
import { SymbolInfo } from "../../analysis/symbol-indexer";
import { ASTWalker } from "../../project/ast/ast";

export class ArraysRule implements Rule {
  public readonly name = "arrays";

  private readonly nativeArrayDeclarations: {
    readonly name: string;
    readonly rank: number;
    readonly line: number;
    readonly isField: boolean;
  }[] = [];

  public onStart(unit: CompilationUnit, context: RuleContext): void {
    const declarations = this.nativeArrayDeclarations;
    new (class extends ASTWalker {
      public override walk(node: Node): void {
        if (
          (node.kind === "FieldDeclaration" || node.kind === "VariableDeclaration") &&
          node.nativeArrayDimensions !== undefined
        ) {
          declarations.push({
            name: node.name.toLowerCase(),
            rank: node.nativeArrayDimensions.length,
            line: Math.max(0, (node.loc?.startLine ?? 1) - 1),
            isField: node.kind === "FieldDeclaration",
          });
        }
        super.walk(node);
      }
    })().walk(unit);
  }

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    if (node.kind === "ArrayAccessExpression") {
      this.checkArrayAccess(node, context);
    } else if (node.kind === "OpaqueStatement" && node.loc) {
      const lineText = context.lines[node.loc.startLine - 1] ?? "";
      if (/^\s*ReDim\b/i.test(lineText)) {
        const range = new vscode.Range(
          node.loc.startLine - 1,
          node.loc.startChar,
          node.loc.startLine - 1,
          node.loc.endChar,
        );
        const diag = new vscode.Diagnostic(
          range,
          "O uso de 'ReDim' sem 'Preserve' apaga completamente o conteúdo do array. Como o compilador Data7 Basic não aceita 'Preserve', todo redimensionamento descarta os dados atuais.",
          vscode.DiagnosticSeverity.Warning,
        );
        // Usamos um código de erro compatível em kebab-case
        diag.code = "redim-without-preserve";
        context.report(diag);
      }
    }
  }

  private checkArrayAccess(node: ArrayAccessExpression, context: RuleContext): void {
    if (!node.loc) return;
    const lineIdx = node.loc.startLine - 1;
    const args = node.indices ?? [node.index];
    const arity = args.length;

    if (node.target.kind === "MemberAccess") {
      const receiverType = TypeResolver.resolveExpressionType(
        node.target.target,
        context.document,
        lineIdx,
        context.indexer,
      );
      if (!receiverType) return;

      const arityMatch = TypeResolver.findMember(
        receiverType,
        node.target.member,
        context.indexer,
        arity,
      );
      if (arityMatch?.kind === "indexed-property") {
        this.checkIndexedPropertyArgumentTypes(arityMatch, args, lineIdx, context);
        return;
      }
      if (arityMatch?.kind === "variable" && arityMatch.nativeArrayRank === arity) {
        this.checkNativeArrayIndexTypes(args, lineIdx, context);
        return;
      }

      const anyMember = TypeResolver.findMember(receiverType, node.target.member, context.indexer);
      if (
        anyMember?.kind === "method" ||
        anyMember?.kind === "declare_function" ||
        anyMember?.kind === "declare_sub"
      ) {
        this.pushBracketCallDiagnostic(node, anyMember.name, lineIdx, context);
        return;
      }
      if (anyMember?.kind === "indexed-property") {
        this.pushIndexedPropertyArityDiagnostic(node, anyMember, arity, lineIdx, context);
      }
      return;
    }

    if (
      node.target.kind === "Identifier" &&
      this.isNativeArrayIdentifier(node.target.name, arity, lineIdx)
    ) {
      this.checkNativeArrayIndexTypes(args, lineIdx, context);
      return;
    }

    const targetType = TypeResolver.resolveExpressionType(
      node.target,
      context.document,
      lineIdx,
      context.indexer,
    );
    if (!targetType) return;
    const lowerTargetType = targetType.toLowerCase();
    if (lowerTargetType === "variant" || lowerTargetType === "string") return;

    const defaultIndexer = TypeResolver.findMember(targetType, "Item", context.indexer, arity);
    if (defaultIndexer?.kind === "indexed-property") {
      this.checkIndexedPropertyArgumentTypes(defaultIndexer, args, lineIdx, context);
      return;
    }

    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc.startChar,
      lineIdx,
      node.target.loc?.endChar ?? node.loc.endChar,
    );
    const diag = new vscode.Diagnostic(
      range,
      `O tipo "${targetType}" não expõe uma property indexada compatível com ${arity} argumento(s). Use colchetes apenas em arrays, matrizes ou properties indexadas.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.DefaultIndexerMissing;
    context.report(diag);
  }

  private isNativeArrayIdentifier(name: string, arity: number, lineIdx: number): boolean {
    const lower = name.toLowerCase();
    return this.nativeArrayDeclarations.some(
      (decl) =>
        decl.name === lower && decl.rank === arity && (decl.isField || decl.line <= lineIdx),
    );
  }

  private checkNativeArrayIndexTypes(
    args: readonly ArrayAccessExpression["index"][],
    lineIdx: number,
    context: RuleContext,
  ): void {
    for (const arg of args) {
      const argType = TypeResolver.resolveExpressionType(
        arg,
        context.document,
        lineIdx,
        context.indexer,
      );
      if (argType && !DiagnosticsLinter.isTypeCompatible(argType, "Integer", context.indexer)) {
        this.pushTypeMismatchDiagnostic(arg, argType, "Integer", lineIdx, context);
      }
    }
  }

  private checkIndexedPropertyArgumentTypes(
    member: SymbolInfo,
    args: readonly ArrayAccessExpression["index"][],
    lineIdx: number,
    context: RuleContext,
  ): void {
    const params = member.parameters ?? [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const param = params[i];
      if (!arg || !param) continue;
      const argType = TypeResolver.resolveExpressionType(
        arg,
        context.document,
        lineIdx,
        context.indexer,
      );
      if (argType && !DiagnosticsLinter.isTypeCompatible(argType, param.type, context.indexer)) {
        this.pushTypeMismatchDiagnostic(arg, argType, param.type, lineIdx, context);
      }
    }
  }

  private pushBracketCallDiagnostic(
    node: ArrayAccessExpression,
    memberName: string,
    lineIdx: number,
    context: RuleContext,
  ): void {
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc?.startChar ?? 0,
      lineIdx,
      node.target.loc?.endChar ?? node.loc?.endChar ?? 0,
    );
    const diag = new vscode.Diagnostic(
      range,
      `Chamada do método/Função "${memberName}" usou colchetes. Métodos e funções aceitam apenas parênteses.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    context.report(diag);
  }

  private pushIndexedPropertyArityDiagnostic(
    node: ArrayAccessExpression,
    member: SymbolInfo,
    arity: number,
    lineIdx: number,
    context: RuleContext,
  ): void {
    const expected = member.parameters?.length ?? 0;
    const range = new vscode.Range(
      lineIdx,
      node.target.loc?.startChar ?? node.loc?.startChar ?? 0,
      lineIdx,
      node.target.loc?.endChar ?? node.loc?.endChar ?? 0,
    );
    const diag = new vscode.Diagnostic(
      range,
      `Acesso à propriedade indexada "${member.name}" espera ${expected} argumento(s), mas recebeu ${arity}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.CallParenthesesMismatch;
    context.report(diag);
  }

  private pushTypeMismatchDiagnostic(
    node: Node,
    actual: string,
    expected: string,
    lineIdx: number,
    context: RuleContext,
  ): void {
    if (!node.loc) return;
    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Incompatibilidade de tipos: não é possível atribuir "${actual}" para "${expected}".`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.TypeMismatch;
    context.report(diag);
  }
}
