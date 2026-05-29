import * as vscode from "vscode";

import { LANGUAGE_IDS } from "../infra/constants";

import { D7BasicCodeActionProvider } from "./code-actions";
import { D7BasicCompletionProvider } from "./completion-provider";
import { D7BasicDefinitionProvider } from "./definition-provider";
import { D7BasicDocumentLinkProvider } from "./document-link-provider";
import { D7BasicDocumentSymbolProvider } from "./document-symbol-provider";
import { D7BasicFoldingRangeProvider } from "./folding-provider";
import { D7BasicFormattingProvider } from "./formatter";
import { D7BasicHoverProvider } from "./hover-provider";
import { D7BasicReferenceProvider } from "./reference-provider";
import { D7BasicRenameProvider } from "./rename-provider";
import {
  D7BasicSemanticTokensLegend,
  D7BasicSemanticTokensProvider,
} from "./semantic-tokens-provider";
import { D7BasicSignatureHelpProvider } from "./signature-provider";
import { D7BasicWorkspaceSymbolProvider } from "./workspace-symbol-provider";

/**
 * Registers every VS Code Language Server provider contributed by the
 * extension. Pulled out of `extension.ts` so the activation entry point can
 * focus on orchestration without listing 13 provider classes inline.
 *
 * The `vscode.languages.register*` calls are still the only sanctioned
 * registration site — they live here because this file is invoked **only**
 * from `extension.ts#activate(context)`. Other modules must not call any
 * `register*Provider` API (see governance.mdc).
 */
export function registerLanguageProviders(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = LANGUAGE_IDS.d7basic;

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, new D7BasicCompletionProvider()),
    vscode.languages.registerDefinitionProvider(selector, new D7BasicDefinitionProvider()),
    vscode.languages.registerHoverProvider(selector, new D7BasicHoverProvider()),
    vscode.languages.registerSignatureHelpProvider(
      selector,
      new D7BasicSignatureHelpProvider(),
      "(",
      ",",
    ),
    vscode.languages.registerDocumentFormattingEditProvider(
      selector,
      new D7BasicFormattingProvider(),
    ),
    vscode.languages.registerCodeActionsProvider(selector, new D7BasicCodeActionProvider(), {
      providedCodeActionKinds: D7BasicCodeActionProvider.providedCodeActionKinds,
    }),
    vscode.languages.registerDocumentSymbolProvider(selector, new D7BasicDocumentSymbolProvider()),
    vscode.languages.registerWorkspaceSymbolProvider(new D7BasicWorkspaceSymbolProvider()),
    vscode.languages.registerFoldingRangeProvider(selector, new D7BasicFoldingRangeProvider()),
    vscode.languages.registerReferenceProvider(selector, new D7BasicReferenceProvider()),
    vscode.languages.registerRenameProvider(selector, new D7BasicRenameProvider()),
    vscode.languages.registerDocumentLinkProvider(selector, new D7BasicDocumentLinkProvider()),
    vscode.languages.registerDocumentSemanticTokensProvider(
      selector,
      new D7BasicSemanticTokensProvider(),
      D7BasicSemanticTokensLegend,
    ),
  );
}
