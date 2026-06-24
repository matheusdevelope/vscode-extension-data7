import * as vscode from "vscode";
import { DiagnosticCodes, LegacyDiagnosticCodes } from "../../diagnostics/diagnostic-codes";
import { getDiagnosticCode } from "../code-action-helpers";
import { addMissingImportFix } from "../quick-fixes/missing-import";
import { addRemoveImportFix } from "../quick-fixes/remove-import";
import { addDeclarationParenthesesMismatchFix } from "../quick-fixes/declaration-parentheses-mismatch";
import { addObjectCreationParenthesesMissingFix } from "../quick-fixes/object-creation-parentheses-missing";
import { addMissingMyBaseNewFix } from "../quick-fixes/missing-mybase-new";
import { addMissingMyBaseFreeFix } from "../quick-fixes/missing-mybase-free";
import { addMissingThenFix } from "../quick-fixes/missing-then";
import { addElseIfWhitespaceFix } from "../quick-fixes/elseif-whitespace";
import { addReturnUnrecommendedFix } from "../quick-fixes/return-unrecommended";
import { addFinallyBlockUnsupportedFix } from "../quick-fixes/finally-block-unsupported";

/**
 * `source.fixAll.data7` — applies every QuickFix that has an `.edit` (missing-import,
 * unused-import, duplicate-import, did-you-mean) in a single atomic `WorkspaceEdit`.
 * Skips command-only actions (install module dispatchers).
 */
export function addFixAllAction(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): void {
  if (diagnostics.length === 0) return;
  const merged = buildFixAllWorkspaceEdit(document, diagnostics);
  if (!merged) return;
  const { edit, count } = merged;

  const action = new vscode.CodeAction(
    `Source: Corrigir todos (${count} edição${count === 1 ? "" : "ões"})`,
    vscode.CodeActionKind.SourceFixAll.append("data7"),
  );
  action.edit = edit;
  actions.push(action);
}

export function buildFixAllWorkspaceEdit(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): { edit: vscode.WorkspaceEdit; count: number } | undefined {
  const collected = collectFixAllActions(document, diagnostics);
  return mergeActionEdits(collected);
}

function collectFixAllActions(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): vscode.CodeAction[] {
  const collected: vscode.CodeAction[] = [];

  for (const diagnostic of diagnostics) {
    switch (getDiagnosticCode(diagnostic)) {
      case DiagnosticCodes.MissingImport:
        addMissingImportFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.UnusedImport:
      case DiagnosticCodes.DuplicateImport:
        addRemoveImportFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.DeclarationParenthesesMismatch:
        addDeclarationParenthesesMismatchFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.ObjectCreationParenthesesMissing:
        addObjectCreationParenthesesMissingFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.MissingMyBaseNew:
        addMissingMyBaseNewFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.MissingMyBaseFree:
        addMissingMyBaseFreeFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.MissingThen:
        addMissingThenFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.ElseIfWhitespace:
        addElseIfWhitespaceFix(collected, document, diagnostic);
        break;
      case DiagnosticCodes.ReturnUnrecommended:
        addReturnUnrecommendedFix(collected, document, diagnostic);
        break;
      case LegacyDiagnosticCodes.FinallyBlockUnsupported:
        addFinallyBlockUnsupportedFix(collected, document, diagnostic);
        break;
      default:
        break;
    }
  }

  return collected;
}

export function mergeActionEdits(
  actions: readonly vscode.CodeAction[],
): { edit: vscode.WorkspaceEdit; count: number } | undefined {
  const merged = new vscode.WorkspaceEdit();
  let count = 0;

  for (const action of actions) {
    if (!action.edit) continue;
    if (typeof action.edit.entries === "function") {
      for (const [uri, edits] of action.edit.entries()) {
        for (const edit of edits) {
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
      if (entry.type === "insert") {
        merged.insert(entry.uri, entry.position, entry.text);
        count++;
        continue;
      }
      if (entry.type === "replace") {
        merged.replace(entry.uri, entry.range, entry.text);
        count++;
        continue;
      }
      merged.delete(entry.uri, entry.range);
      count++;
    }
  }

  return count > 0 ? { edit: merged, count } : undefined;
}
