export interface GeneratedProjectCursorPosition {
  /** Module basename as stored in the source map (`Principal` or `mod_logger`). */
  readonly moduleName: string;
  /** 0-based line inside that module's `<Codigo>` body. */
  readonly line: number;
  /** 0-based column on the document line (same as editor character). */
  readonly column: number;
  /** Raw document line text (may still contain XML entities). */
  readonly lineText: string;
}

/**
 * Map a cursor inside an open `.7Proj` XML document to a generated module position.
 *
 * Walks lines (not `fast-xml-parser`) so offsets stay aligned with the editor.
 * Returns `undefined` when the cursor is outside any `<Codigo>` body.
 */
export function resolveGeneratedPositionFromProjectXml(
  xmlText: string,
  cursorLine: number,
  cursorCharacter: number = 0,
): GeneratedProjectCursorPosition | undefined {
  const lines = xmlText.split(/\r?\n/);
  if (cursorLine < 0 || cursorLine >= lines.length) return undefined;

  let inModulos = false;
  let currentModuleTag: string | undefined;
  let inCodigo = false;
  let codigoModuleName: string | undefined;
  let codigoContentStartLine = -1;
  let codigoDepth = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!inCodigo) {
      if (/^<Modulos\b/i.test(trimmed)) {
        inModulos = true;
      } else if (/^<\/Modulos\s*>/i.test(trimmed)) {
        inModulos = false;
        currentModuleTag = undefined;
      } else if (inModulos) {
        const openModule = /^<([A-Za-z_][\w.]*)\b[^>]*>\s*$/i.exec(trimmed);
        if (openModule?.[1] && !/^Codigo$/i.test(openModule[1])) {
          currentModuleTag = openModule[1];
        }
        const closeModule = /^<\/([A-Za-z_][\w.]*)\s*>/i.exec(trimmed);
        if (closeModule?.[1] && currentModuleTag?.toLowerCase() === closeModule[1].toLowerCase()) {
          currentModuleTag = undefined;
        }
      }

      const codigoOpen = /<Codigo\b[^>]*>/i.exec(line);
      if (codigoOpen) {
        inCodigo = true;
        codigoDepth = 1;
        codigoModuleName = currentModuleTag ?? "Principal";
        const afterTag = line.slice((codigoOpen.index ?? 0) + codigoOpen[0].length);
        if (/<\/Codigo\s*>/i.test(afterTag)) {
          // Single-line Codigo — only map if cursor is on this line after the open tag.
          if (index === cursorLine) {
            const openEnd = (codigoOpen.index ?? 0) + codigoOpen[0].length;
            if (cursorCharacter >= openEnd) {
              return {
                moduleName: codigoModuleName,
                line: 0,
                column: Math.max(0, cursorCharacter - openEnd),
                lineText: afterTag.replace(/<\/Codigo\s*>/i, ""),
              };
            }
          }
          inCodigo = false;
          codigoModuleName = undefined;
          codigoContentStartLine = -1;
          continue;
        }
        // Multi-line: content starts on the next line.
        codigoContentStartLine = index + 1;
        if (index === cursorLine) {
          // Cursor on the opening tag line — not inside generated code.
          return undefined;
        }
      }
      continue;
    }

    // Inside Codigo body.
    if (/<Codigo\b/i.test(line)) {
      codigoDepth += 1;
    }
    if (/<\/Codigo\s*>/i.test(line)) {
      codigoDepth -= 1;
      if (codigoDepth <= 0) {
        // Closing tag line is not part of the generated body.
        if (index === cursorLine) {
          return undefined;
        }
        inCodigo = false;
        codigoModuleName = undefined;
        codigoContentStartLine = -1;
        continue;
      }
    }

    if (index === cursorLine && codigoModuleName !== undefined && codigoContentStartLine >= 0) {
      return {
        moduleName: codigoModuleName,
        line: index - codigoContentStartLine,
        column: cursorCharacter,
        lineText: line,
      };
    }
  }

  return undefined;
}

/** Extract the identifier under `column` on a line of generated Basic (XML text). */
export function wordAtColumn(lineText: string, column: number): string | undefined {
  const wordRegex = /[A-Za-z_]\w*/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(lineText)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (column >= start && column <= end) {
      return match[0];
    }
  }
  return undefined;
}
