import * as vscode from "../../platform/vscode-api";
import type {
  ClassDeclaration,
  CompilationUnit,
  DelegateDeclaration,
  FieldDeclaration,
  Identifier,
  MethodDeclaration,
  Node,
  PropertyDeclaration,
  SourceLocation,
  VariableDeclaration,
} from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import type { NamespaceShadowKind, NamespaceShadowPayload } from "../diagnostic-codes";
import type { RedundantPublicModifierPayload } from "../diagnostic-codes";
import { findConflictingNamespace } from "../diagnostic-helpers";
import type { Rule, RuleContext } from "./base-rule";

const DECLARATIONS_RULE_NODE_KINDS = new Set<Node["kind"]>([
  "VariableDeclaration",
  "FieldDeclaration",
  "ParameterDeclaration",
  "ClassDeclaration",
  "DelegateDeclaration",
  "PropertyDeclaration",
  "MethodDeclaration",
  "ForStatement",
  "ForEachStatement",
  "UsingStatement",
  "TryCatchStatement",
]);

const NAMESPACE_SHADOW_LABEL: Readonly<Record<NamespaceShadowKind, string>> = {
  variable: "variável",
  field: "campo",
  parameter: "parâmetro",
  property: "propriedade",
  "loop-variable": "variável de laço",
  "catch-variable": "variável do Catch",
  "using-variable": "variável do Using",
};

export class DeclarationsRule implements Rule {
  public readonly name = "declarations";
  public readonly supportedNodeKinds = DECLARATIONS_RULE_NODE_KINDS;

  public onStart(_unit: CompilationUnit, _context: RuleContext): void {
    /* no file-level state */
  }

  public checkNode(node: Node, context: RuleContext): void {
    switch (node.kind) {
      case "VariableDeclaration":
        this.checkVariableDeclaration(node, context);
        break;
      case "FieldDeclaration":
        this.checkFieldDeclaration(node, context);
        break;
      case "ParameterDeclaration":
        this.checkNamespaceShadow(node.name, node.loc, "parameter", context);
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
        this.checkNamespaceShadow(node.name, node.loc, "property", context);
        break;
      case "MethodDeclaration":
        this.checkRedundantPublic(node, context);
        break;
      case "ForStatement":
        this.checkLoopIdentifier(node.counter, "loop-variable", context);
        break;
      case "ForEachStatement":
        this.checkLoopIdentifier(node.elementVar, "loop-variable", context);
        break;
      case "UsingStatement":
        this.checkLoopIdentifier(node.resourceVar, "using-variable", context);
        break;
      case "TryCatchStatement":
        if (node.catchVar) {
          this.checkLoopIdentifier(node.catchVar, "catch-variable", context);
        }
        break;
    }
  }

  public onEnd(_unit: CompilationUnit, _context: RuleContext): void {
    /* unused locals/fields are covered by project-wide `unused-code` reachability */
  }

  private checkVariableDeclaration(node: VariableDeclaration, context: RuleContext): void {
    this.checkRedundantPublic(node, context);
    this.checkNamespaceShadow(node.name, node.loc, "variable", context);
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
    this.checkNamespaceShadow(node.name, node.loc, "field", context);
  }

  private checkLoopIdentifier(
    identifier: Identifier,
    kind: NamespaceShadowKind,
    context: RuleContext,
  ): void {
    this.checkNamespaceShadow(identifier.name, identifier.loc, kind, context);
  }

  private checkNamespaceShadow(
    name: string,
    declarationLoc: SourceLocation | undefined,
    declarationKind: NamespaceShadowKind,
    context: RuleContext,
  ): void {
    if (!name) return;
    const conflict = findConflictingNamespace(name, context.indexer);
    if (!conflict) return;
    const loc = declarationLoc ?? enclosingDeclarationLoc(context);
    if (!loc) return;

    const range = rangeForIdentifierName(name, loc, context.lines);
    const label = NAMESPACE_SHADOW_LABEL[declarationKind];
    const article = masculineShadowKind(declarationKind) ? "O" : "A";
    const diag = new vscode.Diagnostic(
      range,
      `${article} ${label} '${name}' usa o nome do namespace '${conflict.namespaceName}'. ` +
        `O compilador trata o identificador como ${article.toLowerCase()} ${label} e deixa de resolver tipos ` +
        `qualificados como '${conflict.namespaceName}.…'. Renomeie ${article.toLowerCase()} ${label}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diag.code = DiagnosticCodes.NamespaceShadow;
    const payload: NamespaceShadowPayload = {
      code: DiagnosticCodes.NamespaceShadow,
      name,
      namespaceName: conflict.namespaceName,
      source: conflict.source,
      declarationKind,
    };
    setDiagnosticPayload(diag, payload);
    context.report(diag);
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

function masculineShadowKind(kind: NamespaceShadowKind): boolean {
  return kind === "field" || kind === "parameter";
}

function enclosingDeclarationLoc(context: RuleContext): SourceLocation | undefined {
  for (let i = context.parentStack.length - 1; i >= 0; i--) {
    const parent = context.parentStack[i];
    if (parent?.loc) return parent.loc;
  }
  return undefined;
}

function findModifierColumn(lineText: string, modifier: string, fallback: number): number {
  const match = new RegExp(`\\b${modifier}\\b`, "i").exec(lineText);
  return match?.index ?? fallback;
}

function rangeForIdentifierName(
  name: string,
  loc: SourceLocation,
  lines: readonly string[],
): vscode.Range {
  const lineIdx = loc.startLine - 1;
  const line = lines[lineIdx] ?? "";
  const from = loc.startChar;
  const to = loc.endLine === loc.startLine ? loc.endChar : line.length;
  const haystack = line.slice(from, to);
  const idx = haystack.toLowerCase().indexOf(name.toLowerCase());
  if (idx < 0) {
    return new vscode.Range(lineIdx, loc.startChar, lineIdx, Math.max(loc.startChar, to));
  }
  const start = from + idx;
  return new vscode.Range(lineIdx, start, lineIdx, start + name.length);
}
