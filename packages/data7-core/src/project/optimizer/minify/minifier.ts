import { DependencyScanner } from "../../../analysis/dependency-scanner";

export interface TextMinifyOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
  /** When true (and enabled), collapse whitespace outside strings. Default should be false. */
  readonly collapseWhitespace?: boolean;
}

export interface MinifyWithMapResult {
  readonly code: string;
  /** generated line index → input line index (0-based). */
  readonly lineMap: number[];
}

/**
 * Textual minify only — never removes declarations.
 * Semantic dead-code removal belongs to `build.optimization.prune`.
 */
export function minifyData7Text(code: string, options: TextMinifyOptions): string {
  return minifyData7TextWithMap(code, options).code;
}

/**
 * Same as {@link minifyData7Text}, also returning a line map for source-map composition.
 * With only `stripComments`, the map is identity (empty lines preserved).
 * With `collapseWhitespace`, blank lines are dropped and the map skips them.
 */
export function minifyData7TextWithMap(
  code: string,
  options: TextMinifyOptions,
): MinifyWithMapResult {
  const collapseWhitespace = options.enabled && options.collapseWhitespace === true;
  const stripComments = options.stripComments;

  const lines = code.split(/\r?\n/);
  if (!collapseWhitespace && !stripComments) {
    return {
      code,
      lineMap: lines.map((_, index) => index),
    };
  }

  const resultLines: string[] = [];
  const lineMap: number[] = [];

  for (let inputIndex = 0; inputIndex < lines.length; inputIndex++) {
    let cleanLine = lines[inputIndex] ?? "";

    if (stripComments) {
      cleanLine = DependencyScanner.stripComments(cleanLine);
    }

    if (collapseWhitespace) {
      const trimmed = cleanLine.trim();
      if (!trimmed) continue;
      resultLines.push(compressWhitespaceOutsideStrings(trimmed));
      lineMap.push(inputIndex);
    } else {
      resultLines.push(cleanLine);
      lineMap.push(inputIndex);
    }
  }

  return {
    code: resultLines.join("\r\n"),
    lineMap,
  };
}

function compressWhitespaceOutsideStrings(text: string): string {
  let compressed = "";
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i] ?? "";
    if (char === '"') {
      if (inString && text[i + 1] === '"') {
        compressed += '""';
        i += 2;
        continue;
      }
      inString = !inString;
      compressed += char;
      i++;
    } else if (inString) {
      compressed += char;
      i++;
    } else if (/\s/.test(char)) {
      compressed += " ";
      while (i < text.length && /\s/.test(text[i] ?? "")) {
        i++;
      }
    } else {
      compressed += char;
      i++;
    }
  }

  return compressed;
}
