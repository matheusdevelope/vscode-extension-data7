import * as vscode from "../../platform/vscode-api";
import type {
  ClassDeclaration,
  CompilationUnit,
  DelegateDeclaration,
  FieldDeclaration,
  MethodDeclaration,
  Node,
  PropertyDeclaration,
  VariableDeclaration,
} from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type {
  IncompletePropertyBodyPayload,
  MissingReturnTypePayload,
  RedundantPublicModifierPayload,
  UnusedDeclarationPayload,
} from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";

const DECLARATIONS_RULE_NODE_KINDS = new Set<Node["kind"]>([
  "VariableDeclaration",
  "FieldDeclaration",
  "ClassDeclaration",
  "DelegateDeclaration",
  "PropertyDeclaration",
  "MethodDeclaration",
]);

export class DeclarationsRule implements Rule {
  public readonly name = "declarations";
  public readonly supportedNodeKinds = DECLARATIONS_RULE_NODE_KINDS;

  public onStart(_unit: CompilationUnit, _context: RuleContext): void {
    /* trackedDeclarations/references come from LintUnitIndex prepass */
  }

  public checkNode(node: Node, context: RuleContext): void {
    switch (node.kind) {
      case "VariableDeclaration":
        this.checkVariableDeclaration(node, context);
        break;
      case "FieldDeclaration":
        this.checkFieldDeclaration(node, context);
        break;
      case "ClassDeclaration":
        this.checkInvalidShared(node, context, "classe");
        this.checkRedundantPublic(node, context);
        break;
      case "DelegateDeclaration":
        this.checkInvalidShared(node, context, "delegate");
        this.checkRedundantPublic(node, context);
        break;
      case "PropertyDeclaration":
        this.checkInvalidShared(node, context, "propriedade");
        this.checkRedundantPublic(node, context);
        break;
      case "MethodDeclaration":
        this.checkRedundantPublic(node, context);
        break;
    }
  }

  public onEnd(_unit: CompilationUnit, context: RuleContext): void {
    for (const declaration of context.unitIndex.trackedDeclarations) {
      if (context.unitIndex.references.has(declaration.name.toLowerCase())) continue;
      const range = new vscode.Range(
        declaration.line,
        declaration.startChar,
        declaration.line,
        declaration.endChar,
      );
      const diag = new vscode.Diagnostic(
        range,
        `Declaração "${declaration.name}" não é utilizada.`,
        vscode.DiagnosticSeverity.Warning,
      );
      diag.code = DiagnosticCodes.UnusedDeclaration;
      const payload: UnusedDeclarationPayload = {
        code: DiagnosticCodes.UnusedDeclaration,
        line: declaration.line,
        startChar: declaration.startChar,
        endChar: declaration.endChar,
      };
      setDiagnosticPayload(diag, payload);
      context.report(diag);
    }
  }

  private checkVariableDeclaration(node: VariableDeclaration, context: RuleContext): void {
    this.checkRedundantPublic(node, context);
    if (!node.isConst || !node.type || !node.loc) return;

    const lineIdx = node.loc.startLine - 1;
    const range = new vscode.Range(lineIdx, node.loc.startChar, lineIdx, node.loc.endChar);
    const diag = new vscode.Diagnostic(
      range,
      `Constante "${node.name}" não deve declarar tipo explícito. Use "Const ${node.name} = valor".`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.TypedConstUnsupported;
    context.report(diag);
  }

  private checkFieldDeclaration(node: FieldDeclaration, context: RuleContext): void {
    this.checkInvalidShared(node, context, "campo");
    this.checkRedundantPublic(node, context);
  }

  private checkInvalidShared(
    node: FieldDeclaration | PropertyDeclaration | DelegateDeclaration | ClassDeclaration,
    context: RuleContext,
    label: string,
  ): void {
    if (!node.loc || !hasModifier(node.modifiers, "shared")) return;
    if (node.kind === "FieldDeclaration" && hasModifier(node.modifiers, "private")) return;

    const lineIdx = node.loc.startLine - 1;
    const startChar = findModifierColumn(
      context.lines[lineIdx] ?? "",
      "shared",
      node.loc.startChar,
    );
    const diag = new vscode.Diagnostic(
      new vscode.Range(lineIdx, startChar, lineIdx, startChar + "Shared".length),
      `O modificador Shared não é válido em ${label}; use Shared somente em Sub ou Function.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.InvalidSharedMember;
    context.report(diag);
  }

  private checkRedundantPublic(
    node:
      | VariableDeclaration
      | FieldDeclaration
      | MethodDeclaration
      | PropertyDeclaration
      | DelegateDeclaration
      | ClassDeclaration,
    context: RuleContext,
  ): void {
    if (!node.loc || !hasModifier(node.modifiers, "public")) return;
    const lineIdx = node.loc.startLine - 1;
    const startChar = findModifierColumn(
      context.lines[lineIdx] ?? "",
      "public",
      node.loc.startChar,
    );
    const endChar = startChar + "Public".length;
    const diag = new vscode.Diagnostic(
      new vscode.Range(lineIdx, startChar, lineIdx, endChar),
      "O modificador Public é redundante porque a visibilidade padrão já é pública.",
      vscode.DiagnosticSeverity.Warning,
    );
    diag.code = DiagnosticCodes.RedundantPublicModifier;
    const payload: RedundantPublicModifierPayload = {
      code: DiagnosticCodes.RedundantPublicModifier,
      line: lineIdx,
      startChar,
      endChar,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
  }
}

function hasModifier(modifiers: readonly string[] | undefined, modifier: string): boolean {
  return modifiers?.some((item) => item.toLowerCase() === modifier) ?? false;
}

function findModifierColumn(lineText: string, modifier: string, fallback: number): number {
  const match = new RegExp(`\\b${modifier}\\b`, "i").exec(lineText);
  return match?.index ?? fallback;
}
