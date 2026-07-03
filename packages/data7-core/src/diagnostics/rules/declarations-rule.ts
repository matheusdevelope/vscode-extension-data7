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
import { ASTWalker } from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type { RedundantPublicModifierPayload, UnusedDeclarationPayload } from "../diagnostic-codes";
import type { Rule, RuleContext } from "./base-rule";

interface TrackedDeclaration {
  readonly name: string;
  readonly line: number;
  readonly startChar: number;
  readonly endChar: number;
}

export class DeclarationsRule implements Rule {
  public readonly name = "declarations";
  private readonly trackedDeclarations: TrackedDeclaration[] = [];
  private readonly references = new Set<string>();

  public onStart(unit: CompilationUnit, _context: RuleContext): void {
    this.trackedDeclarations.length = 0;
    this.references.clear();
    const collector = new DeclarationUsageCollector(this.trackedDeclarations, this.references);
    collector.walk(unit);
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
    for (const declaration of this.trackedDeclarations) {
      if (this.references.has(declaration.name.toLowerCase())) continue;
      const range = new vscode.Range(
        declaration.line,
        declaration.startChar,
        declaration.line,
        declaration.endChar,
      );
      const diag = new vscode.Diagnostic(
        range,
        `Declaração "${declaration.name}" não é usada.`,
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

class DeclarationUsageCollector extends ASTWalker {
  private readonly parentStack: Node[] = [];

  public constructor(
    private readonly declarations: TrackedDeclaration[],
    private readonly references: Set<string>,
  ) {
    super();
  }

  public override walk(node: Node): void {
    this.collectDeclaration(node);
    this.collectReference(node);
    this.parentStack.push(node);
    super.walk(node);
    this.parentStack.pop();
  }

  private collectDeclaration(node: Node): void {
    if (node.kind === "VariableDeclaration") {
      if (!node.loc) return;
      if (this.isInsideFileLevelLambda()) return;
      const shouldTrack = node.isConst || this.isInsideRoutine();
      if (!shouldTrack) return;
      this.declarations.push(
        toTracked(node.name, node.loc.startLine - 1, node.loc.startChar, node.loc.endChar),
      );
      return;
    }

    if (node.kind === "FieldDeclaration") {
      if (!node.loc || !hasModifier(node.modifiers, "private")) return;
      this.declarations.push(
        toTracked(node.name, node.loc.startLine - 1, node.loc.startChar, node.loc.endChar),
      );
    }
  }

  private collectReference(node: Node): void {
    const parent = this.parentStack[this.parentStack.length - 1];
    if (node.kind === "Identifier") {
      if (isDeclarationName(node.name, parent)) return;
      this.references.add(node.name.toLowerCase());
      return;
    }

    if (node.kind === "MemberAccess" && node.member) {
      this.references.add(node.member.toLowerCase());
      return;
    }

    if (node.kind === "MethodInvocation" && node.methodName) {
      this.references.add(node.methodName.toLowerCase());
    }
  }

  private isInsideRoutine(): boolean {
    return this.parentStack.some(
      (node) => node.kind === "MethodDeclaration" || node.kind === "PropertyDeclaration",
    );
  }

  private isInsideFileLevelLambda(): boolean {
    const isInsideLambda = this.parentStack.some((node) => node.kind === "ArrowFunctionExpression");
    if (!isInsideLambda) return false;
    return !this.isInsideRoutine();
  }
}

function toTracked(
  name: string,
  line: number,
  startChar: number,
  endChar: number,
): TrackedDeclaration {
  return { name, line, startChar, endChar: Math.max(endChar, startChar + name.length) };
}

function hasModifier(modifiers: readonly string[] | undefined, modifier: string): boolean {
  return modifiers?.some((item) => item.toLowerCase() === modifier) ?? false;
}

function findModifierColumn(lineText: string, modifier: string, fallback: number): number {
  const match = new RegExp(`\\b${modifier}\\b`, "i").exec(lineText);
  return match?.index ?? fallback;
}

function isDeclarationName(name: string, parent: Node | undefined): boolean {
  if (!parent) return false;
  switch (parent.kind) {
    case "VariableDeclaration":
    case "FieldDeclaration":
    case "MethodDeclaration":
    case "PropertyDeclaration":
    case "DelegateDeclaration":
    case "ClassDeclaration":
    case "ParameterDeclaration":
      return "name" in parent && parent.name.toLowerCase() === name.toLowerCase();
    default:
      return false;
  }
}
