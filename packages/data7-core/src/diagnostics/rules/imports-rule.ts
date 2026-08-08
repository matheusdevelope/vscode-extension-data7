import * as vscode from "../../platform/vscode-api";
import type { Node, CompilationUnit, SourceLocation } from "../../project/ast/ast";
import { TypeResolver } from "../../analysis/type-resolver";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostic-codes";
import { collectTransitivelyRequiredImports } from "../import-usage";
import type { Rule, RuleContext } from "./base-rule";
import { lookupSystemByContainer, lookupSystemNamespaceOrClassByName } from "../../system-library";

const IMPORTS_RULE_NODE_KINDS = new Set<Node["kind"]>(["ImportsDeclaration"]);

export class ImportsRule implements Rule {
  public readonly name = "unused-imports";
  public readonly supportedNodeKinds = IMPORTS_RULE_NODE_KINDS;

  private readonly imports: { name: string; loc: SourceLocation }[] = [];

  public checkNode(node: Node, context: RuleContext, parent: Node | undefined): void {
    if (node.kind === "ImportsDeclaration" && node.loc) {
      this.imports.push({ name: node.target, loc: node.loc });
    }
  }

  public onEnd(_unit: CompilationUnit, context: RuleContext): void {
    const fileUri = context.document.uri.toString();
    const fileSyms = context.indexer.getFileSymbols(fileUri);
    const activeNamespace = fileSyms?.symbols.find((x) => x.kind === "namespace")?.name;
    const activeNamespaceLower = activeNamespace?.toLowerCase();

    const isCircular = (startNs: string, targetNs: string): boolean => {
      const visited = new Set<string>();
      const queue = [targetNs.toLowerCase()];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === startNs.toLowerCase()) return true;
        if (visited.has(current)) continue;
        visited.add(current);

        const currentFiles = context.indexer
          .getAllSymbols()
          .filter((s) => s.kind === "namespace" && s.name.toLowerCase() === current)
          .map((s) => s.fileUri);

        for (const fileUri of currentFiles) {
          const fileSymsForUri = context.indexer.getFileSymbols(fileUri);
          if (fileSymsForUri?.imports) {
            for (const imp of fileSymsForUri.imports) {
              const impLower = imp.toLowerCase();
              if (!visited.has(impLower)) {
                queue.push(impLower);
              }
            }
          }
        }
      }
      return false;
    };

    const directlyReferencedImports = new Set<string>();
    for (const imp of this.imports) {
      if (this.isImportDirectlyReferenced(imp.name, context)) {
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

      if (activeNamespaceLower && key === activeNamespaceLower) {
        const diag = new vscode.Diagnostic(
          range,
          `Imports inválido: o namespace "${imp.name}" importa à si mesmo.`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.CircularImport;
        context.report(diag);
        return;
      }

      if (activeNamespaceLower && isCircular(activeNamespaceLower, key)) {
        const diag = new vscode.Diagnostic(
          range,
          `Referência circular detectada: o namespace "${imp.name}" já importa (direta ou transitivamente) o namespace atual "${activeNamespace}".`,
          vscode.DiagnosticSeverity.Error,
        );
        diag.code = DiagnosticCodes.CircularImport;
        context.report(diag);
        return;
      }

      const isReferenced =
        directlyReferencedImports.has(key) || transitivelyRequiredImports.has(key);

      if (!isReferenced && this.isKnownImportNamespace(imp.name, context)) {
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

  private isImportDirectlyReferenced(name: string, context: RuleContext): boolean {
    const key = name.toLowerCase();
    if (context.unitIndex.qualifiedTypes.has(key)) return true;

    const parts = key.split(".");
    const lastPart = parts[parts.length - 1];
    if (lastPart && context.unitIndex.usedWords.has(lastPart)) return true;

    const symbolsInNamespace = [
      ...context.indexer.getSymbolsByContainer(key),
      ...lookupSystemByContainer(name),
    ];
    if (
      symbolsInNamespace.some((symbol) =>
        context.unitIndex.usedWords.has(symbol.name.toLowerCase()),
      )
    ) {
      return true;
    }

    // Materialized sugars (e.g. Enun → Class Inherits TEnum) index inheritsFrom
    // without naming the base in source — treat the base's namespace as used.
    const fileSyms = context.indexer.getFileSymbols(context.document.uri.toString());
    if (fileSyms) {
      for (const symbol of fileSyms.symbols) {
        if (!symbol.inheritsFrom) continue;
        const parent = TypeResolver.findClassSymbol(symbol.inheritsFrom, context.indexer);
        if (parent?.containerName?.toLowerCase() === key) return true;
        if (parent?.name.toLowerCase() === key) return true;
      }
    }

    return false;
  }

  private isKnownImportNamespace(name: string, context: RuleContext): boolean {
    if (lookupSystemNamespaceOrClassByName(name).length > 0) return true;
    if (lookupSystemByContainer(name).length > 0) return true;

    const workspaceMatches = context.indexer.getSymbolsByName(name);
    if (workspaceMatches.some((symbol) => symbol.kind === "namespace" || symbol.kind === "class")) {
      return true;
    }

    return context.indexer.getSymbolsByContainer(name).length > 0;
  }
}
