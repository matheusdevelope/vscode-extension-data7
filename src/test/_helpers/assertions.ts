import { strict as assert } from "node:assert";
import type * as vscode from "vscode";

/**
 * Domain-specific assertion helpers. They wrap raw `assert.*` calls with
 * messages that include the failing context (collected diagnostic codes, edit
 * shape, member set, …) — making CI failures self-explanatory.
 */

// ===========================================================================
// Diagnostic-related assertions
// ===========================================================================

/**
 * Asserts that `diagnostics` contains at least one entry whose `code` equals
 * `expectedCode`. Returns the first matching diagnostic so the caller can
 * make follow-up assertions on its payload / range.
 */
export function expectDiagnostic(
  diagnostics: readonly vscode.Diagnostic[],
  expectedCode: string,
  messageFragment?: string,
): vscode.Diagnostic {
  const match = diagnostics.find(
    (d) =>
      d.code === expectedCode &&
      (messageFragment === undefined || d.message.includes(messageFragment)),
  );
  if (!match) {
    const found = diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n  ");
    assert.fail(
      `Expected a diagnostic with code "${expectedCode}"` +
        (messageFragment ? ` containing "${messageFragment}"` : "") +
        `, got:\n  ${found || "(no diagnostics)"}`,
    );
  }
  return match;
}

/**
 * Asserts the inverse: no diagnostic in the collection carries `code`.
 */
export function expectNoDiagnostic(
  diagnostics: readonly vscode.Diagnostic[],
  unexpectedCode: string,
): void {
  const found = diagnostics.find((d) => d.code === unexpectedCode);
  if (found) {
    assert.fail(
      `Expected no diagnostic with code "${unexpectedCode}", but found:\n  ${found.message}`,
    );
  }
}

// ===========================================================================
// WorkspaceEdit-related assertions
// ===========================================================================

export interface EditPredicate {
  type?: "insert" | "replace" | "delete";
  line?: number;
  textIncludes?: string;
}

/**
 * Asserts that a `WorkspaceEdit` (more precisely, the `.edits` array exposed
 * by our `vscode-mock.ts`) contains at least one entry matching every field
 * in `predicate`. Returns the first match.
 */
export function expectEdit(
  workspaceEdit: {
    edits: {
      type: string;
      range?: { start: { line: number } };
      position?: { line: number };
      text?: string;
    }[];
  },
  predicate: EditPredicate,
): {
  type: string;
  range?: { start: { line: number } };
  position?: { line: number };
  text?: string;
} {
  const match = workspaceEdit.edits.find((e) => {
    if (predicate.type && e.type !== predicate.type) return false;
    if (predicate.line !== undefined) {
      const editLine = e.range?.start?.line ?? e.position?.line;
      if (editLine !== predicate.line) return false;
    }
    if (predicate.textIncludes !== undefined) {
      if (!e.text?.includes(predicate.textIncludes)) return false;
    }
    return true;
  });
  if (!match) {
    assert.fail(
      `No edit matching ${JSON.stringify(predicate)} found. Edits:\n  ` +
        workspaceEdit.edits.map((e) => JSON.stringify(e)).join("\n  "),
    );
  }
  return match;
}

// ===========================================================================
// SymbolInfo / member-list assertions
// ===========================================================================

/**
 * Asserts that a member list (typically returned by `TypeResolver.getAllMembersForType`)
 * contains every name in `expected` (case-insensitive). Reports the missing set
 * AND the available names when an assertion fails.
 */
export function expectMembers(
  members: readonly { name: string }[],
  expected: readonly string[],
): void {
  const have = new Set(members.map((m) => m.name.toLowerCase()));
  const missing = expected.filter((e) => !have.has(e.toLowerCase()));
  if (missing.length > 0) {
    assert.fail(
      `Missing expected members [${missing.join(", ")}]. ` +
        `Available: [${Array.from(have).join(", ")}]`,
    );
  }
}
