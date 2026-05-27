import * as vscode from "vscode";
import { DependencyScanner } from "../analysis/dependency-scanner";

interface OpenBlock {
  startLine: number;
  endKeyword: RegExp;
  kind: vscode.FoldingRangeKind | undefined;
}

const RE_NAMESPACE_OPEN = /^\s*Namespace\b/i;
const RE_NAMESPACE_CLOSE = /^\s*End\s+Namespace\b/i;

const RE_CLASS_OPEN = /^\s*(?:Public|Private)?\s*(?:Shared)?\s*Class\b/i;
const RE_CLASS_CLOSE = /^\s*End\s+Class\b/i;

const RE_STRUCT_OPEN = /^\s*(?:Public|Private)?\s*Structure\b/i;
const RE_STRUCT_CLOSE = /^\s*End\s+Structure\b/i;

// `Declare Sub|Function` declarations don't have an `End` — exclude them.
const RE_SUB_OPEN =
  /^\s*(?!.*\bDeclare\b)(?:Public|Private)?\s*(?:Shared)?\s*Sub\b(?!.*?\bEnd\s+Sub\b)/i;
const RE_SUB_CLOSE = /^\s*End\s+Sub\b/i;

const RE_FN_OPEN =
  /^\s*(?!.*\bDeclare\b)(?:Public|Private)?\s*(?:Shared)?\s*Function\b(?!.*?\bEnd\s+Function\b)/i;
const RE_FN_CLOSE = /^\s*End\s+Function\b/i;

// Block-If: `If ... Then` with nothing after Then on the same line.
const RE_IF_OPEN = /^\s*If\b.+?\bThen\s*(?:'.*)?$/i;
const RE_IF_CLOSE = /^\s*End\s+If\b/i;

const RE_FOR_OPEN = /^\s*For\b/i;
const RE_FOR_CLOSE = /^\s*Next\b/i;

const RE_WHILE_OPEN = /^\s*(?:While\b|Do\s+While\b|Do\b)/i;
const RE_WHILE_CLOSE = /^\s*(?:End\s+While\b|Loop\b)/i;

const RE_SELECT_OPEN = /^\s*Select\s+Case\b/i;
const RE_SELECT_CLOSE = /^\s*End\s+Select\b/i;

const RE_TRY_OPEN = /^\s*Try\b/i;
const RE_TRY_CLOSE = /^\s*End\s+Try\b/i;

const RE_REGION_OPEN = /^\s*#Region\b/i;
const RE_REGION_CLOSE = /^\s*#End\s+Region\b/i;

const RE_IMPORTS = /^\s*Imports\b/i;

/**
 * Provides semantic folding ranges for Data7 Basic: namespaces, classes,
 * structures, methods, control-flow blocks, `#Region`s and `Imports` runs.
 *
 * The parser is line-based and tolerant — it strips line comments before
 * matching so commented-out keywords are not treated as block openers.
 */
export class D7BasicFoldingRangeProvider implements vscode.FoldingRangeProvider {
  public provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.FoldingRange[]> {
    if (token.isCancellationRequested) return undefined;

    const cleaned = DependencyScanner.stripComments(document.getText()).split(/\r?\n/);
    const ranges: vscode.FoldingRange[] = [];
    const stack: OpenBlock[] = [];

    // Track contiguous Imports for a single fold.
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

    for (let i = 0; i < cleaned.length; i++) {
      const line = cleaned[i];

      // Imports run.
      if (RE_IMPORTS.test(line)) {
        if (!importsRun) importsRun = { start: i, end: i };
        else importsRun.end = i;
      } else if (importsRun) {
        flushImports();
      }

      // Try to close the innermost open block first.
      const top = stack.at(-1);
      if (top?.endKeyword.test(line)) {
        const open = stack.pop();
        if (!open) continue;
        if (i > open.startLine) {
          ranges.push(new vscode.FoldingRange(open.startLine, i, open.kind));
        }
        continue;
      }

      // Try to open a new block. Order matters: more specific patterns first.
      if (RE_REGION_OPEN.test(line)) {
        stack.push({
          startLine: i,
          endKeyword: RE_REGION_CLOSE,
          kind: vscode.FoldingRangeKind.Region,
        });
      } else if (RE_NAMESPACE_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_NAMESPACE_CLOSE, kind: undefined });
      } else if (RE_CLASS_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_CLASS_CLOSE, kind: undefined });
      } else if (RE_STRUCT_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_STRUCT_CLOSE, kind: undefined });
      } else if (RE_SUB_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_SUB_CLOSE, kind: undefined });
      } else if (RE_FN_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_FN_CLOSE, kind: undefined });
      } else if (RE_IF_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_IF_CLOSE, kind: undefined });
      } else if (RE_FOR_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_FOR_CLOSE, kind: undefined });
      } else if (RE_WHILE_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_WHILE_CLOSE, kind: undefined });
      } else if (RE_SELECT_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_SELECT_CLOSE, kind: undefined });
      } else if (RE_TRY_OPEN.test(line)) {
        stack.push({ startLine: i, endKeyword: RE_TRY_CLOSE, kind: undefined });
      }
    }

    flushImports();
    return ranges;
  }
}
