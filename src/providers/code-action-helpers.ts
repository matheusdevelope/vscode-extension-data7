import * as vscode from "vscode";

/** Reads a typed diagnostic payload only when it belongs to the expected code. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readDiagnosticPayload<T extends { code: string }>(
  diagnostic: vscode.Diagnostic,
  expectedCode: string,
): T | undefined {
  const data: unknown = (diagnostic as vscode.Diagnostic & { data?: unknown }).data;
  return data && typeof data === "object" && (data as { code?: unknown }).code === expectedCode
    ? (data as T)
    : undefined;
}

export function extractNamespaceFromMessage(message: string): string | undefined {
  const all = Array.from(message.matchAll(/"([a-zA-Z0-9_.]+)"/g));
  return all.length >= 2 ? all[1]?.[1] : all[0]?.[1];
}

export function findImportInsertLine(document: vscode.TextDocument): number {
  let insertLine = 0;
  for (let i = 0; i < document.lineCount; i++) {
    if (document.lineAt(i).text.trim().toLowerCase().startsWith("imports ")) insertLine = i + 1;
  }
  return insertLine;
}

export function findDeclarationParenthesesInsertPosition(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.Position {
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const match = /\b(?:delegate\s+(?:sub|function)|sub|function)\s+([A-Za-z_]\w*)/i.exec(lineText);
  const name = match?.[1];
  if (match && name) {
    return new vscode.Position(line, match.index + match[0].lastIndexOf(name) + name.length);
  }
  return diagnostic.range.end;
}

export function findMissingThenInsertPosition(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.Position {
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  const commentIdx = lineText.indexOf("'");
  const textBeforeComment = lineText.substring(0, commentIdx === -1 ? lineText.length : commentIdx);
  return new vscode.Position(line, textBeforeComment.trimEnd().length);
}

export function isMissingThenDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return (
    diagnostic.code === "expected-token" &&
    diagnostic.message.toLowerCase().includes("expected 'then'")
  );
}

export function dedupeDiagnostics(diagnostics: readonly vscode.Diagnostic[]): vscode.Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const code = diagnostic.code as unknown;
    const value =
      code && typeof code === "object" && "value" in code
        ? String((code as { value: string | number }).value)
        : typeof code === "string" || typeof code === "number"
          ? String(code)
          : "";
    const range = diagnostic.range;
    const key = `${value}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
