import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";

/**
 * Maps a Data7 `SymbolInfo.kind` to a `vscode.SymbolKind` used by the
 * Outline view, breadcrumbs and the "Go to Symbol" pickers. Single source of
 * truth consumed by both `D7BasicDocumentSymbolProvider` and
 * `D7BasicWorkspaceSymbolProvider`.
 */
export function mapSystemKindToVsCode(s: SymbolInfo): vscode.SymbolKind {
  switch (s.kind) {
    case "namespace":
      return vscode.SymbolKind.Namespace;
    case "class":
      return vscode.SymbolKind.Class;
    case "structure":
      return vscode.SymbolKind.Struct;
    case "delegate":
      return vscode.SymbolKind.Event;
    case "method":
      return vscode.SymbolKind.Method;
    case "property":
      return vscode.SymbolKind.Property;
    case "indexed-property":
      return vscode.SymbolKind.Property;
    case "variable":
      return vscode.SymbolKind.Variable;
    case "declare_sub":
      return vscode.SymbolKind.Function;
    case "declare_function":
      return vscode.SymbolKind.Function;
    default:
      return vscode.SymbolKind.Object;
  }
}
