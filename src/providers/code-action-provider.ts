import * as vscode from "vscode";
import { DiagnosticCodes, LegacyDiagnosticCodes } from "../diagnostics/diagnostic-codes";
import { getDiagnosticCode } from "./code-action-helpers";

// Quick-fixes
import { addLineSuppressionFix, addFileSuppressionFix } from "./quick-fixes/suppression";
import { addMissingImportFix, addMissingImportBulkFix } from "./quick-fixes/missing-import";
import { addRemoveImportFix, addRemoveImportBulkFix } from "./quick-fixes/remove-import";
import {
  addDeclareDependencyFix,
  addDeclareDependencyBulkFix,
} from "./quick-fixes/module-not-declared";
import {
  addInstallModuleFix,
  addInstallModuleBulkFix,
} from "./quick-fixes/module-not-found";
import { addDidYouMeanFixes, addDidYouMeanBulkFix } from "./quick-fixes/unknown-member";
import {
  addUnknownTypeDidYouMeanFixes,
  addUnknownTypeDidYouMeanBulkFix,
} from "./quick-fixes/unknown-type";
import {
  addUnsupportedMemberFixes,
  addUnsupportedMemberBulkFix,
} from "./quick-fixes/unsupported-member";
import {
  addDeclarationParenthesesMismatchFix,
  addDeclarationParenthesesMismatchBulkFix,
} from "./quick-fixes/declaration-parentheses-mismatch";
import {
  addObjectCreationParenthesesMissingFix,
  addObjectCreationParenthesesMissingBulkFix,
} from "./quick-fixes/object-creation-parentheses-missing";
import { addMissingMyBaseNewFix, addMissingMyBaseNewBulkFix } from "./quick-fixes/missing-mybase-new";
import {
  addMissingMyBaseFreeFix,
  addMissingMyBaseFreeBulkFix,
} from "./quick-fixes/missing-mybase-free";
import { addMissingThenFix, addMissingThenBulkFix } from "./quick-fixes/missing-then";
import {
  addElseIfWhitespaceFix,
  addElseIfWhitespaceBulkFix,
} from "./quick-fixes/elseif-whitespace";
import {
  addReturnUnrecommendedFix,
  addReturnUnrecommendedBulkFix,
} from "./quick-fixes/return-unrecommended";
import {
  addFinallyBlockUnsupportedFix,
  addFinallyBlockUnsupportedBulkFix,
} from "./quick-fixes/finally-block-unsupported";

// Source actions
import { addOrganizeImportsAction } from "./source-actions/organize-imports";
import { addFixAllAction, buildFixAllWorkspaceEdit } from "./source-actions/fix-all";

// Refactor rewrites
import {
  addConvertForEachToClassicAction,
  addConvertClassicForToForEachAction,
} from "./refactor-actions/convert-for-each";
import { logger } from "../infra/logger";

/**
 * Provides Quick Fixes (lightbulb actions) for every canonical diagnostic
 * emitted by the linter.
 *
 *  - `missing-import`        → "Importar \"X\""
 *  - `unused-import`         → "Remover Imports \"X\""
 *  - `duplicate-import`      → "Remover linha duplicada"
 *  - `module-not-declared`   → "Instalar e declarar módulo \"X\""
 *  - `module-not-found`      → "Instalar módulo \"X\"…"
 *  - `unknown-member`        → "Você quis dizer \"Y\"?" (Levenshtein, até 3)
 *  - `unsupported-member`    → "Comentar esta linha" + "Suprimir warning aqui"
 *
 * Also exposes bulk Source actions (Ctrl+Shift+P → "Source Action…"):
 *  - `source.organizeImports` — sort `Imports` block alphabetically + dedupe.
 *  - `source.fixAll.data7`    — apply every available QuickFix
 *                                (add missing imports + remove unused/duplicate).
 *
 * Individual quick-fix implementations live in `./quick-fixes/<code>.ts`.
 * Source actions live in `./source-actions/`.
 * Refactor rewrites live in `./refactor-actions/`.
 */
export class D7BasicCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorRewrite,
    vscode.CodeActionKind.SourceOrganizeImports,
    vscode.CodeActionKind.SourceFixAll.append("data7"),
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    if (token.isCancellationRequested) return undefined;

    const actions: vscode.CodeAction[] = [];
    try {

      // Per-diagnostic QuickFixes.
      for (const diagnostic of context.diagnostics) {
        const codeStr = getDiagnosticCode(diagnostic);

        if (codeStr) {
          addLineSuppressionFix(actions, document, diagnostic, codeStr);
          addFileSuppressionFix(actions, document, diagnostic, codeStr);
        }

        switch (codeStr) {
          case DiagnosticCodes.MissingImport:
            addMissingImportFix(actions, document, diagnostic);
            addMissingImportBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.UnusedImport:
          case DiagnosticCodes.DuplicateImport:
            addRemoveImportFix(actions, document, diagnostic);
            addRemoveImportBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.ModuleNotDeclared:
            addDeclareDependencyFix(actions, document, diagnostic);
            addDeclareDependencyBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.ModuleNotFound:
            addInstallModuleFix(actions, diagnostic);
            addInstallModuleBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.UnknownMember:
            addDidYouMeanFixes(actions, document, diagnostic);
            addDidYouMeanBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.UnknownType:
            addUnknownTypeDidYouMeanFixes(actions, document, diagnostic);
            addUnknownTypeDidYouMeanBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.UnsupportedMember:
            addUnsupportedMemberFixes(actions, document, diagnostic);
            addUnsupportedMemberBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.DeclarationParenthesesMismatch:
            addDeclarationParenthesesMismatchFix(actions, document, diagnostic);
            addDeclarationParenthesesMismatchBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.ObjectCreationParenthesesMissing:
            addObjectCreationParenthesesMissingFix(actions, document, diagnostic);
            addObjectCreationParenthesesMissingBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.MissingMyBaseNew:
            addMissingMyBaseNewFix(actions, document, diagnostic);
            addMissingMyBaseNewBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.MissingMyBaseFree:
            addMissingMyBaseFreeFix(actions, document, diagnostic);
            addMissingMyBaseFreeBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.MissingThen:
            addMissingThenFix(actions, document, diagnostic);
            addMissingThenBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.ElseIfWhitespace:
            addElseIfWhitespaceFix(actions, document, diagnostic);
            addElseIfWhitespaceBulkFix(actions, document, diagnostic);
            break;
          case DiagnosticCodes.ReturnUnrecommended:
            addReturnUnrecommendedFix(actions, document, diagnostic);
            addReturnUnrecommendedBulkFix(actions, document, diagnostic);
            break;
          case "expected-token":
            if (diagnostic.message.toLowerCase().includes("expected 'then'")) {
              addMissingThenFix(actions, document, diagnostic);
              addMissingThenBulkFix(actions, document, diagnostic);
            }
            break;
          case LegacyDiagnosticCodes.FinallyBlockUnsupported:
            addFinallyBlockUnsupportedFix(actions, document, diagnostic);
            addFinallyBlockUnsupportedBulkFix(actions, document, diagnostic);
            break;
          default:
            break;
        }
      }

      // Cursor-driven refactor rewrites for the `For Each` sugar.
      addConvertForEachToClassicAction(actions, document, range);
      addConvertClassicForToForEachAction(actions, document, range);

      // Source actions (always available; VS Code filters by `only` when relevant).
      addOrganizeImportsAction(actions, document);
      addFixAllAction(actions, document, context.diagnostics);

      return actions;
    } catch (e) {
      logger.error('Error in provideCodeActions', e);
      return [];
    }
  }

  public buildFixAllWorkspaceEdit(
    document: vscode.TextDocument,
    diagnostics: readonly vscode.Diagnostic[],
  ): { edit: vscode.WorkspaceEdit; count: number } | undefined {
    return buildFixAllWorkspaceEdit(document, diagnostics);
  }
}
