import * as vscode from "vscode";

/**
 * Inserts `' data7:disable-next-line <code>` above the diagnostic line,
 * suppressing the warning only for that specific occurrence.
 */
export function addLineSuppressionFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  code: string,
): void {
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const indent = /^(\s*)/.exec(lineText)?.[1] ?? "";
  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";

  const action = new vscode.CodeAction(
    `Desabilitar erro "${code}" nesta linha`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    new vscode.Position(line, 0),
    `${indent}' data7:disable-next-line ${code}${eol}`,
  );
  action.edit = edit;
  actions.push(action);
}

/**
 * Inserts `' data7:disable <code>` at the very top of the file,
 * suppressing the warning for the entire document.
 */
export function addFileSuppressionFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  code: string,
): void {
  const action = new vscode.CodeAction(
    `Desabilitar erro "${code}" no arquivo inteiro`,
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, new vscode.Position(0, 0), `' data7:disable ${code}${eol}`);
  action.edit = edit;
  actions.push(action);
}
