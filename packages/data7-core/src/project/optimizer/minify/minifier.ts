import { DependencyScanner } from "../../../analysis/dependency-scanner";

export interface TextMinifyOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
  /** When true (and enabled), collapse whitespace outside strings. Default should be false. */
  readonly collapseWhitespace?: boolean;
}

/**
 * Textual minify only — never removes declarations.
 * Semantic dead-code removal belongs to `build.optimization.prune`.
 */
export function minifyData7Text(code: string, options: TextMinifyOptions): string {
  const collapseWhitespace = options.enabled && options.collapseWhitespace === true;
  const stripComments = options.stripComments;

  if (!collapseWhitespace && !stripComments) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  const resultLines: string[] = [];

  for (const lineText of lines) {
    let cleanLine = lineText;

    if (stripComments) {
      cleanLine = DependencyScanner.stripComments(lineText);
    }

    if (collapseWhitespace) {
      const trimmed = cleanLine.trim();
      if (!trimmed) continue;
      resultLines.push(compressWhitespaceOutsideStrings(trimmed));
    } else {
      resultLines.push(cleanLine);
    }
  }

  return resultLines.join("\r\n");
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
