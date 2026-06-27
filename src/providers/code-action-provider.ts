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
import { addInstallModuleFix, addInstallModuleBulkFix } from "./quick-fixes/module-not-found";
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
import {
  addMissingMyBaseNewFix,
  addMissingMyBaseNewBulkFix,
} from "./quick-fixes/missing-mybase-new";
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
  addLineContinuationWithoutBreakFix,
  addLineContinuationWithoutBreakBulkFix,
} from "./quick-fixes/line-continuation-without-break";
import {
  addReturnUnrecommendedFix,
  addReturnUnrecommendedBulkFix,
} from "./quick-fixes/return-unrecommended";
import {
  addRedundantTerminalExitFix,
  addRedundantTerminalExitBulkFix,
} from "./quick-fixes/redundant-terminal-exit";
import {
  addReturnAssignmentInCatchFix,
  addReturnAssignmentInCatchBulkFix,
} from "./quick-fixes/return-assignment-in-catch";
import { addInlineIfThenFix, addInlineIfThenBulkFix } from "./quick-fixes/inline-if-then";
import {
  addFinallyBlockUnsupportedFix,
  addFinallyBlockUnsupportedBulkFix,
} from "./quick-fixes/finally-block-unsupported";
import { addDeadCodeCommentFix, addDeadCodeCommentBulkFix } from "./quick-fixes/dead-code";

// Source actions
import { addOrganizeImportsAction } from "./source-actions/organize-imports";

// Refactor rewrites
import {
  addConvertForEachToClassicAction,
  addConvertClassicForToForEachAction,
} from "./refactor-actions/convert-for-each";
import { logger } from "../infra/logger";

const DIAGNOSTIC_PRIORITY: Record<string, number> = {
  [DiagnosticCodes.RedundantTerminalExit]: 0,
  [DiagnosticCodes.ReturnUnrecommended]: 1,
  [DiagnosticCodes.ReturnAssignmentInCatch]: 1,
  [DiagnosticCodes.InlineIfThen]: 2,
  [DiagnosticCodes.ElseIfWhitespace]: 3,
  [DiagnosticCodes.MissingThen]: 4,
};

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

  public getQuickFixesForDiagnostic(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    const codeStr = getDiagnosticCode(diagnostic);

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
      case DiagnosticCodes.LineContinuationWithoutBreak:
        addLineContinuationWithoutBreakFix(actions, document, diagnostic);
        addLineContinuationWithoutBreakBulkFix(actions, document, diagnostic);
        break;
      case DiagnosticCodes.ReturnUnrecommended:
        addReturnUnrecommendedFix(actions, document, diagnostic);
        addReturnUnrecommendedBulkFix(actions, document, diagnostic);
        break;
      case DiagnosticCodes.RedundantTerminalExit:
        addRedundantTerminalExitFix(actions, document, diagnostic);
        addRedundantTerminalExitBulkFix(actions, document, diagnostic);
        break;
      case DiagnosticCodes.DeadCode:
        addDeadCodeCommentFix(actions, document, diagnostic);
        addDeadCodeCommentBulkFix(actions, document, diagnostic);
        break;
      case DiagnosticCodes.ReturnAssignmentInCatch:
        addReturnAssignmentInCatchFix(actions, document, diagnostic);
        addReturnAssignmentInCatchBulkFix(actions, document, diagnostic);
        break;
      case DiagnosticCodes.InlineIfThen:
        addInlineIfThenFix(actions, document, diagnostic);
        addInlineIfThenBulkFix(actions, document, diagnostic);
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

    if (codeStr) {
      addLineSuppressionFix(actions, document, diagnostic, codeStr);
      addFileSuppressionFix(actions, document, diagnostic, codeStr);
    }
    return actions;
  }

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
        actions.push(...this.getQuickFixesForDiagnostic(document, diagnostic));
      }

      // Cursor-driven refactor rewrites for the `For Each` sugar.
      addConvertForEachToClassicAction(actions, document, range);
      addConvertClassicForToForEachAction(actions, document, range);

      // Source actions (always available; VS Code filters by `only` when relevant).
      addOrganizeImportsAction(actions, document);
      addFixAllAction(actions, document, context.diagnostics, this);

      return actions;
    } catch (e) {
      logger.error("Error in provideCodeActions", e);
      return [];
    }
  }

  public buildFixAllWorkspaceEdit(
    document: vscode.TextDocument,
    diagnostics: readonly vscode.Diagnostic[],
  ): { edit: vscode.WorkspaceEdit; count: number } | undefined {
    const collected: vscode.CodeAction[] = [];

    const sortedDiags = [...diagnostics].sort((a, b) => {
      const codeA = getDiagnosticCode(a) ?? "";
      const codeB = getDiagnosticCode(b) ?? "";
      const prioA = DIAGNOSTIC_PRIORITY[codeA] ?? 10;
      const prioB = DIAGNOSTIC_PRIORITY[codeB] ?? 10;
      return prioA - prioB;
    });

    for (const diagnostic of sortedDiags) {
      const actions = this.getQuickFixesForDiagnostic(document, diagnostic);
      const firstFix = actions.find(
        (action) =>
          action instanceof vscode.CodeAction &&
          !!action.kind?.value.startsWith(vscode.CodeActionKind.QuickFix.value) &&
          !!action.edit &&
          !action.title.startsWith("Desabilitar "),
      );
      if (firstFix) {
        collected.push(firstFix);
      }
    }

    return mergeActionEdits(collected);
  }
}

export function mergeActionEdits(
  actions: readonly vscode.CodeAction[],
): { edit: vscode.WorkspaceEdit; count: number } | undefined {
  const merged = new vscode.WorkspaceEdit();
  let count = 0;
  const acceptedRanges = new Map<string, vscode.Range[]>();

  const checkAndAdd = (uriStr: string, range: vscode.Range): boolean => {
    let ranges = acceptedRanges.get(uriStr);
    if (!ranges) {
      ranges = [];
      acceptedRanges.set(uriStr, ranges);
    }
    for (const accepted of ranges) {
      if (rangesConflict(accepted, range)) {
        return false;
      }
    }
    ranges.push(range);
    return true;
  };

  for (const action of actions) {
    if (!action.edit) continue;
    if (typeof action.edit.entries === "function") {
      for (const [uri, edits] of action.edit.entries()) {
        const uriStr = uri.toString();
        for (const edit of edits) {
          if (!checkAndAdd(uriStr, edit.range)) {
            continue;
          }
          if (edit.newText === "") {
            merged.delete(uri, edit.range);
          } else if (edit.range.isEmpty) {
            merged.insert(uri, edit.range.start, edit.newText);
          } else {
            merged.replace(uri, edit.range, edit.newText);
          }
          count++;
        }
      }
      continue;
    }

    const mockEdits = (action.edit as { edits?: unknown[] }).edits;
    if (!Array.isArray(mockEdits)) continue;
    for (const mockEdit of mockEdits) {
      const entry = mockEdit as
        | { type: "insert"; uri: vscode.Uri; position: vscode.Position; text: string }
        | { type: "replace"; uri: vscode.Uri; range: vscode.Range; text: string }
        | { type: "delete"; uri: vscode.Uri; range: vscode.Range };

      const uriStr = entry.uri.toString();
      const range =
        entry.type === "insert" ? new vscode.Range(entry.position, entry.position) : entry.range;

      if (!checkAndAdd(uriStr, range)) {
        continue;
      }

      if (entry.type === "insert") {
        merged.insert(entry.uri, entry.position, entry.text);
        count++;
      } else if (entry.type === "replace") {
        merged.replace(entry.uri, entry.range, entry.text);
        count++;
      } else {
        merged.delete(entry.uri, entry.range);
        count++;
      }
    }
  }

  return count > 0 ? { edit: merged, count } : undefined;
}

function rangesConflict(r1: vscode.Range, r2: vscode.Range): boolean {
  if (r1.isEmpty && r2.isEmpty) {
    return r1.start.isEqual(r2.start);
  }
  if (r1.isEmpty) {
    return r1.start.line >= r2.start.line && r1.start.line <= r2.end.line;
  }
  if (r2.isEmpty) {
    return r2.start.line >= r1.start.line && r2.start.line <= r1.end.line;
  }
  const start1 = r1.start.line;
  const end1 = r1.end.line;
  const start2 = r2.start.line;
  const end2 = r2.end.line;
  return Math.max(start1, start2) <= Math.min(end1, end2);
}

function addFixAllAction(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
  provider: D7BasicCodeActionProvider,
): void {
  if (diagnostics.length === 0) return;
  const merged = provider.buildFixAllWorkspaceEdit(document, diagnostics);
  if (!merged) return;
  const { edit, count } = merged;

  const action = new vscode.CodeAction(
    `Source: Corrigir todos (${count} edição${count === 1 ? "" : "ões"})`,
    vscode.CodeActionKind.SourceFixAll.append("data7"),
  );
  action.edit = edit;
  actions.push(action);
}
