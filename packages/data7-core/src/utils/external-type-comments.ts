/**
 * Parses comments that declare native/external Delphi types accepted by the
 * linter even when they are not present in the Data7 workspace index.
 *
 * Supported forms:
 *
 *   ' data7:external-type Retorno
 *   ' data7:external-type Retorno scope=line
 *   ' data7:external-type Retorno scope=block
 *   ' data7:external-type Retorno scope=file
 *
 * The default scope is `line`, intended for a single variable declaration.
 */

export type ExternalTypeScope = "line" | "block" | "file";

export interface ExternalTypeDirective {
  readonly line: number;
  readonly column: number;
  readonly typeName: string;
  readonly scope: ExternalTypeScope;
}

export interface ExternalTypeActiveScope {
  readonly startLine: number;
  readonly endLine: number;
}

const EXTERNAL_TYPE_REGEX =
  /(?:'|REM\s)\s*data7:external-type\s+([A-Za-z_][A-Za-z0-9_.]*(?:<[^>'\r\n]+>)?)(?:\s+scope=(line|block|file))?/i;

export function extractExternalTypeDirectives(text: string): ExternalTypeDirective[] {
  const directives: ExternalTypeDirective[] = [];
  const lines = text.split(/\r?\n/);

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const match = EXTERNAL_TYPE_REGEX.exec(line);
    const typeName = match?.[1];
    if (!typeName) continue;

    directives.push({
      line: lineIdx,
      column: line.indexOf(typeName, match.index),
      typeName,
      scope: parseExternalTypeScope(match[2]),
    });
  }

  return directives;
}

export function isExternalTypeAllowedByDirectives(
  directives: readonly ExternalTypeDirective[],
  typeName: string,
  lineIdx: number,
  activeScope?: ExternalTypeActiveScope,
): boolean {
  const normalizedType = normalizeExternalTypeName(typeName);

  return directives.some((directive) => {
    if (normalizeExternalTypeName(directive.typeName) !== normalizedType) return false;

    if (directive.scope === "file") return true;
    if (directive.scope === "line") return directive.line === lineIdx;
    if (!activeScope) return false;

    return (
      lineIdx >= activeScope.startLine &&
      lineIdx <= activeScope.endLine &&
      ((directive.line === activeScope.startLine - 1 && activeScope.startLine <= lineIdx) ||
        (directive.line >= activeScope.startLine && directive.line <= lineIdx))
    );
  });
}

export function normalizeExternalTypeName(typeName: string): string {
  return typeName.trim().toLowerCase();
}

function parseExternalTypeScope(raw: string | undefined): ExternalTypeScope {
  const normalized = raw?.toLowerCase();
  if (normalized === "block" || normalized === "file") return normalized;
  return "line";
}
