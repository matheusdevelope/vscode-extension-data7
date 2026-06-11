import * as vscode from "vscode";
import type { SymbolInfo } from "../analysis/symbol-indexer";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { SYSTEM_SYMBOLS } from "../system-library";
import { LanguageProcessor } from "../analysis/language-processor";

/**
 * Token types we declare to VS Code. Order matters — index = `legend.tokenTypes.indexOf(type)`.
 */
const TOKEN_TYPES = ["class", "namespace", "method", "property", "variable", "event"] as const;
type TokenType = (typeof TOKEN_TYPES)[number];

const TOKEN_MODIFIERS = ["static", "declaration", "deprecated"] as const;

/**
 * Public legend exposed by `vscode.languages.registerDocumentSemanticTokensProvider`.
 * The order of `tokenTypes`/`tokenModifiers` is part of the wire format.
 */
export const D7BasicSemanticTokensLegend = new vscode.SemanticTokensLegend(
  [...TOKEN_TYPES],
  [...TOKEN_MODIFIERS],
);

/**
 * Provides semantic highlighting for `.bas` files. Unlike TextMate grammar
 * (which colours only by syntax), this provider colours identifiers based on
 * their resolved kind in the symbol indexer + system library.
 */
export class D7BasicSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    if (token.isCancellationRequested) return undefined;

    const lookup = this.buildSymbolLookup();
    const builder = new vscode.SemanticTokensBuilder(D7BasicSemanticTokensLegend);

    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const tokens = cached.tokens;
    for (const t of tokens) {
      if (t.kind === "identifier") {
        const kind = lookup.get(t.value.toLowerCase());
        if (kind) {
          const tokenTypeIdx = TOKEN_TYPES.indexOf(kind);
          const line = Math.max(0, t.loc.line - 1);
          builder.push(line, t.loc.column, t.value.length, tokenTypeIdx, 0);
        }
      }
    }

    return builder.build();
  }

  /** Map of lower-cased identifier → `TokenType`. Combines workspace + SL. */
  private buildSymbolLookup(): Map<string, TokenType> {
    const lookup = new Map<string, TokenType>();
    const remember = (name: string, type: TokenType): void => {
      const key = name.toLowerCase();
      if (!lookup.has(key)) lookup.set(key, type);
    };

    const classify = (s: SymbolInfo): TokenType | undefined => {
      switch (s.kind) {
        case "class":
        case "structure":
          return "class";
        case "namespace":
          return "namespace";
        case "method":
        case "declare_sub":
        case "declare_function":
          return "method";
        case "property":
          return /^On[A-Z]/.test(s.name) ? "event" : "property";
        case "variable":
          return "variable";
        case "delegate":
          return "event";
        default:
          return undefined;
      }
    };

    for (const s of SYSTEM_SYMBOLS) {
      const t = classify(s);
      if (t) remember(s.name, t);
    }
    for (const s of this.indexer.getAllSymbols()) {
      const t = classify(s);
      if (t) remember(s.name, t);
    }
    return lookup;
  }
}
