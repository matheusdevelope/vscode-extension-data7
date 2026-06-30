import * as vscode from "../../platform/vscode-api";
import type { Node, CompilationUnit, SourceLocation } from "../../project/ast/ast";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import { ASTWordCollector } from "../ast-collectors";
import { collectTransitivelyRequiredImports } from "../import-usage";
import type { Rule, RuleContext } from "./base-rule";
import { lookupSystemByContainer, lookupSystemByName } from "../../system-library";

export class ImportsRule implements Rule {
  public readonly name = "unused-imports";

  private readonly imports: { name: string; loc: SourceLocation }[] = [];

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    if (node.kind === "ImportsDeclaration" && node.loc) {
      this.imports.push({ name: node.target, loc: node.loc });
    }
  }

  public onEnd(unit: CompilationUnit, context: RuleContext): void {
    const wordCollector = new ASTWordCollector();
    wordCollector.walk(unit);

    const directlyReferencedImports = new Set<string>();
    for (const imp of this.imports) {
      if (this.isImportDirectlyReferenced(imp.name, wordCollector, context)) {
        directlyReferencedImports.add(imp.name.toLowerCase());
      }
    }

    const transitivelyRequiredImports = collectTransitivelyRequiredImports(
      context.indexer,
      directlyReferencedImports,
    );

    const seenImports = new Map<string, SourceLocation>();
    this.imports.forEach((imp) => {
      const key = imp.name.toLowerCase();
      const firstLoc = seenImports.get(key);
      const range = new vscode.Range(
        imp.loc.startLine - 1,
        imp.loc.startChar,
        imp.loc.endLine - 1,
        imp.loc.endChar,
      );

      if (firstLoc !== undefined) {
        const diag = new vscode.Diagnostic(
          range,
          `Imports duplicado: "${imp.name}" já foi declarado na linha ${firstLoc.startLine}.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.DuplicateImport;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.UnusedImport,
          namespace: imp.name,
        });
        context.report(diag);
        return;
      }
      seenImports.set(key, imp.loc);

      const hasSymbolsInWorkspaceContainer = context.indexer.getSymbolsByContainer(key).length > 0;
      const hasSymbolsInSystemContainer = lookupSystemByContainer(imp.name).length > 0;
      const isNamespaceSymbolInWorkspace = context.indexer
        .getSymbolsByName(imp.name)
        .some((s) => s.kind === "namespace");
      const isNamespaceSymbolInSystem = lookupSystemByName(imp.name).some(
        (s) => s.kind === "namespace",
      );
      const isClassOrStructInWorkspace = context.indexer
        .getSymbolsByName(imp.name)
        .some((s) => s.kind === "class" || s.kind === "structure");
      const isClassOrStructInSystem = lookupSystemByName(imp.name).some(
        (s) => s.kind === "class" || s.kind === "structure",
      );

      const isNamespaceDeclared =
        hasSymbolsInWorkspaceContainer ||
        hasSymbolsInSystemContainer ||
        isNamespaceSymbolInWorkspace ||
        isNamespaceSymbolInSystem ||
        isClassOrStructInWorkspace ||
        isClassOrStructInSystem;

      if (!isNamespaceDeclared) {
        const diag = new vscode.Diagnostic(
          range,
          `Módulo ou namespace não declarado no projeto: "${imp.name}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.ModuleNotFound;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.ModuleNotFound,
          moduleName: imp.name,
        });
        context.report(diag);
        return;
      }

      const isReferenced =
        directlyReferencedImports.has(key) || transitivelyRequiredImports.has(key);

      if (!isReferenced) {
        const diag = new vscode.Diagnostic(
          range,
          `Imports não utilizado: "${imp.name}" não é referenciado no código.`,
          vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DiagnosticCodes.UnusedImport;
        setDiagnosticPayload(diag, {
          code: DiagnosticCodes.UnusedImport,
          namespace: imp.name,
        });
        context.report(diag);
      }
    });
  }

  private isImportDirectlyReferenced(
    name: string,
    wordCollector: ASTWordCollector,
    context: RuleContext,
  ): boolean {
    const key = name.toLowerCase();
    if (wordCollector.qualifiedTypes.has(key)) return true;

    const parts = key.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart && wordCollector.usedWords.has(lastPart)) return true;

    const symbolsInNamespace = [
      ...context.indexer.getSymbolsByContainer(key),
      ...lookupSystemByContainer(name),
    ];
    return symbolsInNamespace.some((symbol) =>
      wordCollector.usedWords.has(symbol.name.toLowerCase()),
    );
  }
}
