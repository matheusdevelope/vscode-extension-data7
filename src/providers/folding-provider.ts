import * as vscode from "vscode";
import { LanguageProcessor } from "../analysis/language-processor";
import type { Node } from "../project/generics-monomorphizer/ast";

/**
 * Provides semantic folding ranges for Data7 Basic: namespaces, classes,
 * structures, methods, control-flow blocks, `#Region`s and `Imports` runs.
 * Uses the AST from LanguageProcessor for semantic structures, and a simple line-scan
 * for preprocessor `#Region` and `Imports` runs.
 */
export class D7BasicFoldingRangeProvider implements vscode.FoldingRangeProvider {
  public provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    if (token.isCancellationRequested) return undefined;

    const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), document.getText());
    const unit = cached.unit;
    const ranges: vscode.FoldingRange[] = [];

    // Traverse AST for semantic blocks
    traverseForFolding(unit, ranges);

    // Line scan for #Region and Imports
    const lines = document.getText().split(/\r?\n/);
    const regionStack: number[] = [];
    const RE_REGION_OPEN = /^\s*#Region\b/i;
    const RE_REGION_CLOSE = /^\s*#End\s+Region\b/i;
    const RE_IMPORTS = /^\s*Imports\b/i;
    let importsRun: { start: number; end: number } | null = null;

    const flushImports = (): void => {
      if (importsRun && importsRun.end > importsRun.start) {
        ranges.push(
          new vscode.FoldingRange(
            importsRun.start,
            importsRun.end,
            vscode.FoldingRangeKind.Imports,
          ),
        );
      }
      importsRun = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";

      // Imports
      if (RE_IMPORTS.test(line)) {
        if (!importsRun) {
          importsRun = { start: i, end: i };
        } else {
          importsRun.end = i;
        }
      } else if (importsRun) {
        flushImports();
      }

      // Region
      if (RE_REGION_OPEN.test(line)) {
        regionStack.push(i);
      } else if (RE_REGION_CLOSE.test(line)) {
        const start = regionStack.pop();
        if (start !== undefined && i > start) {
          ranges.push(new vscode.FoldingRange(start, i, vscode.FoldingRangeKind.Region));
        }
      }
    }
    flushImports();

    return ranges;
  }
}

function traverseForFolding(node: Node | undefined, ranges: vscode.FoldingRange[]): void {
  if (!node) return;

  if (node.loc) {
    const startLine = Math.max(0, node.loc.startLine - 1);
    const endLine = Math.max(0, node.loc.endLine - 1);

    if (endLine > startLine) {
      const exists = ranges.some((r) => r.start === startLine && r.end === endLine);
      if (!exists) {
        const shouldFold = [
          "NamespaceDeclaration",
          "ClassDeclaration",
          "MethodDeclaration",
          "PropertyDeclaration",
          "EnumDeclaration",
          "IfStatement",
          "ForStatement",
          "ForEachStatement",
          "WhileStatement",
          "TryCatchStatement",
          "UsingStatement",
          "MatchStatement",
          "WithStatement",
          "SelectCaseStatement",
        ].includes(node.kind);

        if (shouldFold) {
          ranges.push(new vscode.FoldingRange(startLine, endLine));
        }
      }
    }
  }

  switch (node.kind) {
    case "CompilationUnit":
    case "NamespaceDeclaration":
      for (const m of node.members) {
        traverseForFolding(m, ranges);
      }
      break;
    case "ClassDeclaration":
      for (const m of node.members) {
        traverseForFolding(m, ranges);
      }
      break;
    case "MethodDeclaration":
      for (const s of node.body) {
        traverseForFolding(s, ranges);
      }
      break;
    case "PropertyDeclaration":
      traverseForFolding(node.getter, ranges);
      traverseForFolding(node.setter, ranges);
      break;
    case "EnumDeclaration":
      // Enum entries are single-line and do not need folding traversal themselves
      break;
    case "IfStatement":
      for (const s of node.thenBranch) {
        traverseForFolding(s, ranges);
      }
      for (const branch of node.elseIfBranches) {
        for (const s of branch.body) {
          traverseForFolding(s, ranges);
        }
      }
      if (node.elseBranch) {
        for (const s of node.elseBranch) {
          traverseForFolding(s, ranges);
        }
      }
      break;
    case "ForStatement":
    case "ForEachStatement":
    case "WhileStatement":
    case "UsingStatement":
    case "WithStatement":
      for (const s of node.body) {
        traverseForFolding(s, ranges);
      }
      break;
    case "MatchStatement":
      for (const c of node.cases) {
        for (const s of c.body) {
          traverseForFolding(s, ranges);
        }
      }
      break;
    case "SelectCaseStatement":
      for (const c of node.cases) {
        for (const s of c.body) {
          traverseForFolding(s, ranges);
        }
      }
      break;
    case "TryCatchStatement":
      for (const s of node.tryBody) {
        traverseForFolding(s, ranges);
      }
      for (const s of node.catchBody) {
        traverseForFolding(s, ranges);
      }
      if (node.finallyBody) {
        for (const s of node.finallyBody) {
          traverseForFolding(s, ranges);
        }
      }
      break;
  }
}
