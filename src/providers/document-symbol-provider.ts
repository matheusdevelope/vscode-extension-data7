import * as vscode from "vscode";
import { LanguageProcessor } from "../analysis/language-processor";
import type {
  TopLevelMember,
  ClassMember,
  SourceLocation,
} from "../project/generics-monomorphizer/ast";

/**
 * Provides hierarchical symbols (Namespace > Class > Method/Property/Field)
 * for the Outline view, breadcrumbs, sticky scroll and `Ctrl+Shift+O`
 * using the unified parser AST.
 */
export class D7BasicDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  public provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    if (token.isCancellationRequested) return undefined;

    const cached = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), document.getText());
    const unit = cached.unit;

    const symbols: vscode.DocumentSymbol[] = [];
    for (const m of unit.members) {
      symbols.push(...processMember(m));
    }
    return symbols;
  }
}

function toVsCodeRange(loc: SourceLocation | undefined): vscode.Range {
  if (!loc) {
    return new vscode.Range(0, 0, 0, 0);
  }
  const startLine = Math.max(0, loc.startLine - 1);
  const endLine = Math.max(0, loc.endLine - 1);
  return new vscode.Range(startLine, loc.startChar, endLine, loc.endChar);
}

function toSelectionRange(name: string, loc: SourceLocation | undefined): vscode.Range {
  if (!loc) {
    return new vscode.Range(0, 0, 0, 0);
  }
  const startLine = Math.max(0, loc.startLine - 1);
  return new vscode.Range(startLine, loc.startChar, startLine, loc.startChar + name.length);
}

function processMember(member: TopLevelMember | ClassMember): vscode.DocumentSymbol[] {
  const symbols: vscode.DocumentSymbol[] = [];
  const range = toVsCodeRange(member.loc);
  const name = "name" in member ? member.name : "";
  const selRange = toSelectionRange(name, member.loc);

  switch (member.kind) {
    case "NamespaceDeclaration": {
      const sym = new vscode.DocumentSymbol(
        member.name,
        "Namespace",
        vscode.SymbolKind.Namespace,
        range,
        selRange
      );
      for (const m of member.members) {
        sym.children.push(...processMember(m));
      }
      symbols.push(sym);
      break;
    }
    case "ClassDeclaration": {
      const detail = member.baseType ? `Class ← ${member.baseType.name}` : "Class";
      const sym = new vscode.DocumentSymbol(
        member.name,
        detail,
        vscode.SymbolKind.Class,
        range,
        selRange
      );
      for (const m of member.members) {
        sym.children.push(...processMember(m));
      }
      symbols.push(sym);
      break;
    }
    case "MethodDeclaration": {
      const isSub = !member.returnType;
      const params = member.parameters.length;
      const paramStr = `(${params} param${params === 1 ? "" : "s"})`;
      const detail = isSub 
        ? (member.isConstructor ? "Sub New" : `Sub ${paramStr}`)
        : `Function ${paramStr} → ${member.returnType ? member.returnType.name : "Variant"}`;
      const sym = new vscode.DocumentSymbol(
        member.name,
        detail,
        vscode.SymbolKind.Method,
        range,
        selRange
      );
      symbols.push(sym);
      break;
    }
    case "PropertyDeclaration": {
      const detail = `Property: ${member.type.name}`;
      const sym = new vscode.DocumentSymbol(
        member.name,
        detail,
        vscode.SymbolKind.Property,
        range,
        selRange
      );
      symbols.push(sym);
      break;
    }
    case "FieldDeclaration": {
      const detail = `Field: ${member.type.name}`;
      const sym = new vscode.DocumentSymbol(
        member.name,
        detail,
        vscode.SymbolKind.Field,
        range,
        selRange
      );
      symbols.push(sym);
      break;
    }
    case "EnumDeclaration": {
      const sym = new vscode.DocumentSymbol(
        member.name,
        "Enum",
        vscode.SymbolKind.Enum,
        range,
        selRange
      );
      for (const entry of member.entries) {
        const entryRange = toVsCodeRange(entry.loc);
        const entrySelRange = toSelectionRange(entry.name, entry.loc);
        const entrySym = new vscode.DocumentSymbol(
          entry.name,
          "Enum Member",
          vscode.SymbolKind.EnumMember,
          entryRange,
          entrySelRange
        );
        sym.children.push(entrySym);
      }
      symbols.push(sym);
      break;
    }
    case "DelegateDeclaration": {
      const sym = new vscode.DocumentSymbol(
        member.name,
        "Delegate",
        vscode.SymbolKind.Event,
        range,
        selRange
      );
      symbols.push(sym);
      break;
    }
    case "VariableDeclaration": {
      const typeSuffix = member.type ? `: ${member.type.name}` : "";
      const detail = `${member.isConst ? "Const" : "Var"}${typeSuffix}`;
      const sym = new vscode.DocumentSymbol(
        member.name,
        detail,
        vscode.SymbolKind.Variable,
        range,
        selRange
      );
      symbols.push(sym);
      break;
    }
    case "DestructuredVariableDeclaration": {
      for (const b of member.bindings) {
        const bRange = toVsCodeRange(member.loc);
        const bSelRange = toSelectionRange(b.name, member.loc);
        const sym = new vscode.DocumentSymbol(
          b.name,
          "Var (Destructured)",
          vscode.SymbolKind.Variable,
          bRange,
          bSelRange
        );
        symbols.push(sym);
      }
      break;
    }
  }
  return symbols;
}
