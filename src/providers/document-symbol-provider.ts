import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { mapSystemKindToVsCode } from "../utils/symbol-kind";

/**
 * Provides hierarchical symbols (Namespace > Class > Method/Property/Field)
 * for the Outline view, breadcrumbs, sticky scroll and `Ctrl+Shift+O`.
 *
 * Hierarchy is derived from each symbol's `containerName`: top-level entries
 * have no container, classes/structures are children of their namespace, and
 * members live under their owning class.
 */
export class D7BasicDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    if (token.isCancellationRequested) return undefined;

    const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
    if (!fileSyms || fileSyms.symbols.length === 0) return [];

    const byContainer = new Map<string, SymbolInfo[]>();
    const topLevel: SymbolInfo[] = [];
    for (const s of fileSyms.symbols) {
      if (s.containerName) {
        const a = byContainer.get(s.containerName) ?? [];
        a.push(s);
        byContainer.set(s.containerName, a);
      } else {
        topLevel.push(s);
      }
    }

    const toDocumentSymbol = (s: SymbolInfo): vscode.DocumentSymbol => {
      // `range` should cover the ENTIRE symbol body (header → `End Xxx`) so
      // breadcrumbs / sticky scroll know which symbol the cursor sits inside.
      // `selectionRange` should pinpoint the name on the header line.
      const fullRange = toFullRange(s);
      const selRange = toSelectionRange(s);
      const detail = buildDetail(s);
      const sym = new vscode.DocumentSymbol(
        s.name,
        detail,
        mapSystemKindToVsCode(s),
        fullRange,
        selRange,
      );
      const children = byContainer.get(s.name);
      if (children) {
        for (const c of children.sort((a, b) => a.range.startLine - b.range.startLine)) {
          sym.children.push(toDocumentSymbol(c));
        }
      }
      return sym;
    };

    return topLevel.sort((a, b) => a.range.startLine - b.range.startLine).map(toDocumentSymbol);
  }
}

/**
 * Range covering the entire symbol body. Used as the `range` of a `DocumentSymbol`
 * so that VS Code can answer "what symbol is the cursor in?" (powers breadcrumbs
 * and sticky-scroll).
 */
function toFullRange(s: SymbolInfo): vscode.Range {
  return new vscode.Range(s.range.startLine, s.range.startChar, s.range.endLine, s.range.endChar);
}

/**
 * Range pinpointing the symbol name on the header line. Used as the
 * `selectionRange` so that clicking a breadcrumb highlights only the name.
 */
function toSelectionRange(s: SymbolInfo): vscode.Range {
  return new vscode.Range(
    s.range.startLine,
    s.range.startChar,
    s.range.startLine,
    s.range.startChar + s.name.length,
  );
}

function buildDetail(s: SymbolInfo): string {
  switch (s.kind) {
    case "namespace":
      return "Namespace";
    case "class":
      return s.inheritsFrom ? `Class ← ${s.inheritsFrom}` : "Class";
    case "structure":
      return "Structure";
    case "delegate":
      return "Delegate";
    case "method": {
      const params = (s.parameters ?? []).length;
      return s.type === "Void"
        ? `Sub (${params} param${params === 1 ? "" : "s"})`
        : `Function (${params}) → ${s.type}`;
    }
    case "property":
      return `Property: ${s.type}`;
    case "variable":
      return `Var: ${s.type}`;
    case "declare_sub":
      return "Declare Sub";
    case "declare_function":
      return `Declare Function → ${s.type}`;
    default:
      return "";
  }
}
