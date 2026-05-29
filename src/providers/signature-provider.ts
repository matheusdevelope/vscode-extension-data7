import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { lookupSystemByName, lookupSystemNamespaceOrClassByName } from "../system-library";
import { TypeResolver } from "../analysis/type-resolver";
import { getChainPrefix } from "../utils/chain-parser";

export class D7BasicSignatureHelpProvider implements vscode.SignatureHelpProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  private static getSignatureHelpContext(
    lineText: string,
    characterIdx: number,
  ): { name: string; dotPrefix?: string; activeParamIdx: number } | undefined {
    let parenCount = 0;
    let commaCount = 0;
    let inQuote = false;
    let wordEndIdx = -1;

    // Scan backward from characterIdx - 1
    for (let i = characterIdx - 1; i >= 0; i--) {
      const char = lineText[i];
      if (char === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (inQuote) continue;

      if (char === ")") {
        parenCount++;
      } else if (char === "(") {
        if (parenCount > 0) {
          parenCount--;
        } else {
          wordEndIdx = i;
          break;
        }
      } else if (char === "," && parenCount === 0) {
        commaCount++;
      }
    }

    if (wordEndIdx === -1) return undefined;

    // Extract the function name word preceding the '('
    let scanIdx = wordEndIdx - 1;
    while (scanIdx >= 0 && /\s/.test(lineText[scanIdx] ?? "")) {
      scanIdx--;
    }

    const idMatch = /([a-zA-Z0-9_]+)$/.exec(lineText.substring(0, scanIdx + 1));
    if (!idMatch?.[1]) return undefined;

    const funcName = idMatch[1];
    let dotPrefix: string | undefined;

    const prefixStart = idMatch.index || 0;
    if (prefixStart > 0 && lineText[prefixStart - 1] === ".") {
      dotPrefix = getChainPrefix(lineText, prefixStart - 1);
    }

    return {
      name: funcName,
      dotPrefix,
      activeParamIdx: commaCount,
    };
  }

  public provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    _context: vscode.SignatureHelpContext,
  ): vscode.ProviderResult<vscode.SignatureHelp> {
    if (token.isCancellationRequested) return undefined;
    const lineText = document.lineAt(position.line).text;
    const sigCtx = D7BasicSignatureHelpProvider.getSignatureHelpContext(
      lineText,
      position.character,
    );
    if (!sigCtx) return undefined;

    let targetSymbol: SymbolInfo | undefined;

    if (sigCtx.dotPrefix) {
      const dotPrefixLower = sigCtx.dotPrefix.toLowerCase();
      if (dotPrefixLower === "me" || dotPrefixLower === "mybase") {
        const fileSyms = this.indexer.getFileSymbols(document.uri.toString());
        if (fileSyms) {
          const currentClass = fileSyms.symbols.find(
            (s) =>
              s.kind === "class" &&
              position.line >= s.range.startLine &&
              position.line <= s.range.endLine,
          );
          if (currentClass) {
            targetSymbol = this.findClassMember(currentClass.name, sigCtx.name);
          }
        }
      } else {
        let typeName = TypeResolver.inferExpressionType(
          sigCtx.dotPrefix,
          document,
          position.line,
          this.indexer,
        );
        if (!typeName) {
          typeName = TypeResolver.getVariableType(
            sigCtx.dotPrefix,
            document,
            position,
            this.indexer,
          );
          typeName ??=
            this.indexer.findSymbolByName(sigCtx.dotPrefix, document.uri.toString())?.name ??
            (
              lookupSystemNamespaceOrClassByName(sigCtx.dotPrefix)[0] as
                | { name: string }
                | undefined
            )?.name;
        }
        if (typeName) {
          targetSymbol = this.findClassMember(typeName, sigCtx.name);
        }
      }
    } else {
      targetSymbol =
        this.indexer.findSymbolByName(sigCtx.name, document.uri.toString()) ??
        lookupSystemByName(sigCtx.name).find(
          (s) => s.kind === "method" || s.kind === "declare_function" || s.kind === "declare_sub",
        );
    }

    if (
      targetSymbol &&
      (targetSymbol.kind === "method" ||
        targetSymbol.kind === "declare_function" ||
        targetSymbol.kind === "declare_sub" ||
        targetSymbol.kind === "delegate" ||
        targetSymbol.kind === "indexed-property")
    ) {
      const sigHelp = new vscode.SignatureHelp();

      // Build the list of signatures: primary `parameters` + each `overloads[i]`.
      const overloadSets: readonly (readonly {
        name: string;
        type: string;
        isByRef: boolean;
        isOptional: boolean;
        defaultValue?: string;
      }[])[] = [targetSymbol.parameters ?? [], ...(targetSymbol.overloads ?? [])];

      sigHelp.signatures = overloadSets.map((params) =>
        this.buildSignatureInfo(targetSymbol, params),
      );

      // Pick the overload that best matches the argument count typed so far.
      const argCount = sigCtx.activeParamIdx + 1;
      const bestIdx = pickOverloadIndex(overloadSets, argCount);
      sigHelp.activeSignature = bestIdx;
      const activeParams = sigHelp.signatures[bestIdx]?.parameters ?? [];
      sigHelp.activeParameter = Math.min(
        sigCtx.activeParamIdx,
        Math.max(0, activeParams.length - 1),
      );

      return sigHelp;
    }

    return undefined;
  }

  private buildSignatureInfo(
    sym: SymbolInfo,
    params: readonly {
      name: string;
      type: string;
      isByRef: boolean;
      isOptional: boolean;
      defaultValue?: string;
    }[],
  ): vscode.SignatureInformation {
    const paramList = params
      .map((p) => {
        let pStr = "";
        if (p.isOptional) pStr += "Optional ";
        if (p.isByRef) pStr += "ByRef ";
        pStr += `${p.name} As ${p.type}`;
        if (p.defaultValue) pStr += ` = ${p.defaultValue}`;
        return pStr;
      })
      .join(", ");

    const isSub = sym.type === "Void";
    const prefix =
      sym.kind === "delegate" ? "Delegate " : sym.kind === "indexed-property" ? "Property " : "";
    const verb = sym.kind === "indexed-property" ? "" : isSub ? "Sub " : "Function ";
    const label = `${prefix}${verb}${sym.name}(${paramList}) As ${sym.type}`;

    const info = new vscode.SignatureInformation(label, sym.description ?? undefined);
    info.parameters = params.map((p) => {
      let doc = p.isOptional ? "Opcional. " : "Obrigatório. ";
      if (p.isByRef) doc += "Passado por referência (ByRef). ";
      if (p.defaultValue) doc += `Valor padrão: ${p.defaultValue}`;
      return new vscode.ParameterInformation(`${p.name} As ${p.type}`, doc);
    });
    return info;
  }

  private findClassMember(className: string, memberName: string): SymbolInfo | undefined {
    return TypeResolver.findMember(className, memberName, this.indexer);
  }
}

/**
 * Picks the overload whose required-parameter count best matches `argCount`.
 * Preference order:
 *   1. an overload whose `params.length === argCount`;
 *   2. otherwise the overload with the smallest distance from `argCount`;
 *   3. on ties, the first (primary) overload wins for stability.
 */
function pickOverloadIndex(
  overloadSets: readonly (readonly { isOptional: boolean }[])[],
  argCount: number,
): number {
  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  overloadSets.forEach((params, idx) => {
    const requiredCount = params.filter((p) => !p.isOptional).length;
    const totalCount = params.length;
    let score: number;
    if (argCount >= requiredCount && argCount <= totalCount) {
      score = 0; // perfect fit (respeitando optional)
    } else {
      score = Math.min(Math.abs(argCount - requiredCount), Math.abs(argCount - totalCount));
    }
    if (score < bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  return bestIdx;
}
