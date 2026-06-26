import { DependencyScanner } from "../../../analysis/dependency-scanner";

export interface TextMinifyOptions {
  readonly enabled: boolean;
  readonly stripComments: boolean;
}

export function minifyData7Text(code: string, options: TextMinifyOptions): string {
  if (!options.enabled && !options.stripComments) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  const resultLines: string[] = [];

  for (const lineText of lines) {
    let cleanLine = lineText;

    if (options.stripComments) {
      cleanLine = DependencyScanner.stripComments(lineText);
    }

    if (options.enabled) {
      const trimmed = cleanLine.trim();
      if (!trimmed) continue;
      resultLines.push(compressWhitespaceOutsideStrings(trimmed));
    } else {
      const trimmed = cleanLine.trim();
      if (!trimmed && cleanLine.length > 0) continue;
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
