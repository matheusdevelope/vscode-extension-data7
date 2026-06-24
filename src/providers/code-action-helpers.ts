import * as vscode from "vscode";

/** Normalizes the diagnostic code shape exposed by VS Code. */
export function getDiagnosticCode(diagnostic: vscode.Diagnostic): string | undefined {
  const rawCode = diagnostic.code;
  if (typeof rawCode === "string") return rawCode;
  if (typeof rawCode === "number") return String(rawCode);
  if (rawCode && typeof rawCode === "object" && "value" in rawCode) {
    return String(rawCode.value);
  }
  return undefined;
}

/** Matches diagnostics regardless of VS Code's code representation. */
export function hasDiagnosticCode(diagnostic: vscode.Diagnostic, expectedCode: string): boolean {
  return getDiagnosticCode(diagnostic) === expectedCode;
}

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

export function findObjectCreationParenthesesInsertPosition(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.Position {
  const line = diagnostic.range.start.line;
  const lineText = document.lineAt(line).text;
  let cursor = diagnostic.range.start.character;

  // TypeReference locations currently identify the first character only.
  // Scan the source type to append the constructor call after its full name.
  const typeName = /^(?:[A-Za-z_]\w*)(?:\s*\.\s*[A-Za-z_]\w*)*/.exec(lineText.slice(cursor));
  if (!typeName) return diagnostic.range.end;
  cursor += typeName[0].length;

  let genericStart = cursor;
  while (lineText[genericStart] === " " || lineText[genericStart] === "\t") genericStart++;
  if (lineText[genericStart] !== "<") return new vscode.Position(line, cursor);
  cursor = genericStart;

  let depth = 0;
  while (cursor < lineText.length) {
    const char = lineText[cursor];
    if (char === "<") depth++;
    if (char === ">" && --depth === 0) {
      cursor++;
      break;
    }
    cursor++;
  }
  if (depth !== 0) return diagnostic.range.end;
  return new vscode.Position(line, cursor);
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
    hasDiagnosticCode(diagnostic, "expected-token") &&
    diagnostic.message.toLowerCase().includes("expected 'then'")
  );
}

export function dedupeDiagnostics(diagnostics: readonly vscode.Diagnostic[]): vscode.Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const value = getDiagnosticCode(diagnostic) ?? "";
    const range = diagnostic.range;
    const key = `${value}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
