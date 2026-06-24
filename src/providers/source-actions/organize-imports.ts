import * as vscode from "vscode";

/**
 * `source.organizeImports` — re-emits the `Imports` block alphabetically and
 * without duplicates, preserving only the first occurrence of any import name.
 *
 * The action is only emitted when the file has at least two `Imports` lines,
 * since a single import cannot be sorted or de-duplicated meaningfully.
 */
export function addOrganizeImportsAction(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
): void {
  interface Hit {
    line: number;
    name: string;
  }

  const hits: Hit[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const trimmed = text.trim();

    if (trimmed === "") {
      // Allow blank lines inside the imports block — we'll discard them.
      if (hits.length === 0) continue;
      continue;
    }

    const m = /^\s*Imports\s+([A-Za-z_][\w.]*)\s*$/i.exec(text);
    const importName = m?.[1];
    if (!importName) {
      if (hits.length === 0) continue;
      break; // first non-imports, non-blank line stops the block
    }
    hits.push({ line: i, name: importName });
  }

  if (hits.length < 2) return;

  const unique = new Map<string, string>();
  for (const h of hits) {
    const key = h.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, h.name);
  }
  const sorted = Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  const rewritten = sorted.map((n) => `Imports ${n}`).join("\r\n") + "\r\n";

  const firstHit = hits[0];
  const lastHit = hits[hits.length - 1] ?? firstHit;
  if (!firstHit || !lastHit) return;

  const range = new vscode.Range(firstHit.line, 0, lastHit.line + 1, 0);
  const action = new vscode.CodeAction(
    "Source: Organizar Imports",
    vscode.CodeActionKind.SourceOrganizeImports,
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, rewritten);
  action.edit = edit;
  actions.push(action);
}
