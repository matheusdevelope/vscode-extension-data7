/**
 * Utilities for batch workspace operations that need to read/write files
 * without opening them as VS Code editor tabs.
 *
 * `buildMockDocument` — builds a minimal `vscode.TextDocument`-compatible
 * object from raw text content. Satisfies every property/method used by the
 * quick-fix providers and the diagnostics linter without touching the VS Code
 * document model (no events, no editors).
 *
 * `applyTextEditsToContent` — applies a sorted array of `vscode.TextEdit`s to
 * a raw string without going through `workspace.applyEdit`. This lets the
 * workspace-fix pipeline write corrected files directly to disk via `fs`,
 * avoiding the `onDidChangeTextDocument` cascade triggered by `applyEdit`.
 */

import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Mock TextDocument
// ---------------------------------------------------------------------------

interface MockTextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: vscode.Range;
  readonly rangeIncludingLineBreak: vscode.Range;
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}

function buildMockLine(lineNumber: number, text: string, isLastLine: boolean): MockTextLine {
  const range = new vscode.Range(lineNumber, 0, lineNumber, text.length);
  // rangeIncludingLineBreak extends to column 0 of next line (or end of text for last line)
  const rangeIncludingLineBreak = isLastLine
    ? range
    : new vscode.Range(lineNumber, 0, lineNumber + 1, 0);
  const firstNonWS = text.match(/\S/)?.index ?? text.length;
  return {
    lineNumber,
    text,
    range,
    rangeIncludingLineBreak,
    firstNonWhitespaceCharacterIndex: firstNonWS,
    isEmptyOrWhitespace: text.trim().length === 0,
  };
}

/**
 * Builds a lightweight `vscode.TextDocument`-compatible mock that reads from
 * `content` without registering anything with the VS Code extension host.
 *
 * Covered surface (everything used by quick-fix providers + linter):
 *  - `uri`, `fileName`, `languageId`, `version`, `isDirty`, `isClosed`
 *  - `eol` (auto-detected from content)
 *  - `lineCount`
 *  - `getText(range?)` — full text or sub-range
 *  - `lineAt(line | position)` — returns MockTextLine
 *  - `offsetAt(position)` / `positionAt(offset)`
 *  - `getWordRangeAtPosition(position, regex?)` — basic word-boundary scan
 *  - `validateRange(range)` / `validatePosition(position)`
 *  - `save()` — always resolves `true` (no-op; batch pipeline writes via fs)
 */
export function buildMockDocument(
  uri: vscode.Uri,
  content: string,
  languageId = "d7basic",
): vscode.TextDocument {
  // Detect EOL: prefer CRLF when present, otherwise LF.
  const eol: vscode.EndOfLine = content.includes("\r\n")
    ? vscode.EndOfLine.CRLF
    : vscode.EndOfLine.LF;

  // Split preserving empty trailing line when content ends with newline.
  const rawLines = content.split(/\r?\n/);
  // Remove the phantom empty entry that split adds after a trailing newline
  // only if the last "line" is empty and we actually have content — VS Code's
  // real documents behave identically.
  const lines: string[] =
    rawLines.length > 1 && rawLines[rawLines.length - 1] === ""
      ? rawLines.slice(0, -1)
      : rawLines;

  const lineCount = lines.length;

  /** Absolute character offset for the start of a given line index. */
  const lineOffsets: number[] = (() => {
    const offsets: number[] = [0];
    for (let i = 0; i < lines.length - 1; i++) {
      const lineLen = (lines[i]?.length ?? 0) + (eol === vscode.EndOfLine.CRLF ? 2 : 1);
      offsets.push((offsets[i] ?? 0) + lineLen);
    }
    return offsets;
  })();

  function clampLine(n: number): number {
    return Math.max(0, Math.min(n, lineCount - 1));
  }

  function clampCol(line: number, col: number): number {
    return Math.max(0, Math.min(col, lines[line]?.length ?? 0));
  }

  function validatePosition(pos: vscode.Position): vscode.Position {
    const line = clampLine(pos.line);
    const col = clampCol(line, pos.character);
    return line === pos.line && col === pos.character ? pos : new vscode.Position(line, col);
  }

  function validateRange(range: vscode.Range): vscode.Range {
    const start = validatePosition(range.start);
    const end = validatePosition(range.end);
    return start === range.start && end === range.end ? range : new vscode.Range(start, end);
  }

  function lineAt(lineOrPos: number | vscode.Position): MockTextLine {
    const n = clampLine(
      typeof lineOrPos === "number" ? lineOrPos : lineOrPos.line,
    );
    const text = lines[n] ?? "";
    const isLast = n === lineCount - 1;
    return buildMockLine(n, text, isLast);
  }

  function offsetAt(pos: vscode.Position): number {
    const line = clampLine(pos.line);
    const col = clampCol(line, pos.character);
    return (lineOffsets[line] ?? 0) + col;
  }

  function positionAt(offset: number): vscode.Position {
    const clamped = Math.max(0, Math.min(offset, content.length));
    // Binary search for the line.
    let lo = 0;
    let hi = lineCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineOffsets[mid] ?? 0) <= clamped) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const col = clamped - (lineOffsets[lo] ?? 0);
    return new vscode.Position(lo, col);
  }

  function getText(range?: vscode.Range): string {
    if (!range) return content;
    const start = offsetAt(range.start);
    const end = offsetAt(range.end);
    return content.slice(start, end);
  }

  function getWordRangeAtPosition(
    position: vscode.Position,
    regex?: RegExp,
  ): vscode.Range | undefined {
    const line = clampLine(position.line);
    const text = lines[line] ?? "";
    const col = clampCol(line, position.character);
    const pattern = regex ?? /\w+/g;
    // Reset lastIndex to avoid stale state on reused regex instances.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (start <= col && col <= end) {
        return new vscode.Range(line, start, line, end);
      }
    }
    return undefined;
  }

  return {
    uri,
    fileName: uri.fsPath,
    languageId,
    version: 0,
    isDirty: false,
    isClosed: false,
    isUntitled: false,
    encoding: "utf-8",
    eol,
    lineCount,
    getText,
    lineAt,
    offsetAt,
    positionAt,
    validateRange,
    validatePosition,
    getWordRangeAtPosition,
    // No-op: batch pipeline writes via node:fs after applying edits.
    save: (): Thenable<boolean> => Promise.resolve(true),
  } as unknown as vscode.TextDocument;
}

// ---------------------------------------------------------------------------
// applyTextEditsToContent
// ---------------------------------------------------------------------------

/**
 * Applies an array of `vscode.TextEdit`s to a raw string and returns the
 * modified content.  Edits are applied from the end of the document backwards
 * so that earlier character offsets remain stable.
 *
 * Safe to call with an empty `edits` array (returns `content` unchanged).
 */
export function applyTextEditsToContent(
  content: string,
  edits: readonly vscode.TextEdit[],
): string {
  if (edits.length === 0) return content;

  // Detect EOL for offset arithmetic.
  const crlf = content.includes("\r\n");
  const lines = content.split(/\r?\n/);

  /** Absolute offset for a Position inside this content. */
  function offsetAt(pos: vscode.Position): number {
    const line = Math.max(0, Math.min(pos.line, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < line; i++) {
      offset += (lines[i]?.length ?? 0) + (crlf ? 2 : 1);
    }
    const col = Math.max(0, Math.min(pos.character, lines[line]?.length ?? 0));
    return offset + col;
  }

  // Sort edits from last to first (reverse document order) to keep offsets stable.
  const sorted = [...edits].sort((a, b) => {
    const lineDiff = b.range.start.line - a.range.start.line;
    if (lineDiff !== 0) return lineDiff;
    return b.range.start.character - a.range.start.character;
  });

  let result = content;
  for (const edit of sorted) {
    const start = offsetAt(edit.range.start);
    const end = offsetAt(edit.range.end);
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }
  return result;
}
