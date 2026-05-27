import * as vscode from "vscode";

const keywordCasingMap = new Map<string, string>([
  ["imports", "Imports"],
  ["namespace", "Namespace"],
  ["class", "Class"],
  ["structure", "Structure"],
  ["delegate", "Delegate"],
  ["property", "Property"],
  ["get", "Get"],
  ["set", "Set"],
  ["shared", "Shared"],
  ["sub", "Sub"],
  ["function", "Function"],
  ["dim", "Dim"],
  ["as", "As"],
  ["if", "If"],
  ["then", "Then"],
  ["else", "Else"],
  ["elseif", "ElseIf"],
  ["end if", "End If"],
  ["select case", "Select Case"],
  ["case", "Case"],
  ["end select", "End Select"],
  ["for", "For"],
  ["to", "To"],
  ["step", "Step"],
  ["next", "Next"],
  ["each", "Each"],
  ["in", "In"],
  ["do", "Do"],
  ["loop", "Loop"],
  ["while", "While"],
  ["until", "Until"],
  ["try", "Try"],
  ["catch", "Catch"],
  ["finally", "Finally"],
  ["end try", "End Try"],
  ["return", "Return"],
  ["new", "New"],
  ["inherits", "Inherits"],
  ["mybase", "MyBase"],
  ["me", "me"],
  ["null", "NULL"],
  ["exit", "Exit"],
  ["overrides", "Overrides"],
  ["overridable", "Overridable"],
  ["private", "Private"],
  ["public", "Public"],
  ["protected", "Protected"],
  ["declare", "Declare"],
  ["lib", "Lib"],
  ["alias", "Alias"],
]);

export class CodeFormatter {
  public static formatKeywordsInLine(lineText: string): string {
    // Separate comment first
    let comment = "";
    let code = lineText;
    const quoteIdx = lineText.indexOf("'");
    if (quoteIdx !== -1) {
      comment = lineText.substring(quoteIdx);
      code = lineText.substring(0, quoteIdx);
    } else {
      const remIdx = lineText.toLowerCase().indexOf("rem ");
      if (remIdx !== -1) {
        comment = lineText.substring(remIdx);
        code = lineText.substring(0, remIdx);
      }
    }

    let result = "";
    let i = 0;
    while (i < code.length) {
      const char = code[i];
      if (char === '"') {
        const endQuote = code.indexOf('"', i + 1);
        if (endQuote !== -1) {
          result += code.substring(i, endQuote + 1);
          i = endQuote + 1;
        } else {
          result += code.substring(i);
          break;
        }
      } else {
        if (/[a-zA-Z0-9_]/.test(char)) {
          const start = i;
          while (i < code.length && /[a-zA-Z0-9_]/.test(code[i])) {
            i++;
          }
          const word = code.substring(start, i);
          const lowerWord = word.toLowerCase();
          const replacement = keywordCasingMap.get(lowerWord);
          result += replacement ?? word;
        } else {
          result += char;
          i++;
        }
      }
    }

    // Replace multi-word keywords
    result = result
      .replace(/\bend\s+if\b/gi, "End If")
      .replace(/\bselect\s+case\b/gi, "Select Case")
      .replace(/\bend\s+select\b/gi, "End Select")
      .replace(/\bend\s+try\b/gi, "End Try")
      .replace(/\bend\s+sub\b/gi, "End Sub")
      .replace(/\bend\s+function\b/gi, "End Function")
      .replace(/\bend\s+property\b/gi, "End Property")
      .replace(/\bend\s+class\b/gi, "End Class")
      .replace(/\bend\s+structure\b/gi, "End Structure")
      .replace(/\bend\s+namespace\b/gi, "End Namespace");

    return result + comment;
  }

  public static formatCode(text: string): string {
    const lines = text.split(/\r?\n/);
    const formattedLines: string[] = [];
    let indentLevel = 0;
    const indentSize = 3;

    for (const lineText of lines) {
      const trimmed = lineText.trim();
      if (!trimmed) {
        formattedLines.push("");
        continue;
      }

      let cleanLine = trimmed;
      const quoteIdx = trimmed.indexOf("'");
      if (quoteIdx !== -1) {
        cleanLine = trimmed.substring(0, quoteIdx).trim();
      } else {
        const remIdx = trimmed.toLowerCase().indexOf("rem ");
        if (remIdx !== -1) {
          cleanLine = trimmed.substring(0, remIdx).trim();
        }
      }

      const lowerClean = cleanLine.toLowerCase();

      // Closing elements decrease indent before printing
      const isClosing =
        lowerClean === "end namespace" ||
        lowerClean === "end class" ||
        lowerClean === "end structure" ||
        lowerClean === "end property" ||
        lowerClean === "end sub" ||
        lowerClean === "end function" ||
        lowerClean === "end if" ||
        lowerClean === "next" ||
        lowerClean === "loop" ||
        lowerClean === "end try" ||
        lowerClean === "end select" ||
        lowerClean === "end get" ||
        lowerClean === "end set" ||
        lowerClean === "else" ||
        lowerClean.startsWith("elseif ") ||
        lowerClean.startsWith("elseif\t") ||
        lowerClean.startsWith("catch ") ||
        lowerClean.startsWith("catch\t") ||
        lowerClean === "catch" ||
        lowerClean.startsWith("finally") ||
        lowerClean === "finally";

      if (isClosing && indentLevel > 0) {
        indentLevel--;
      }

      const casedLine = this.formatKeywordsInLine(trimmed);
      const indentStr = " ".repeat(indentLevel * indentSize);
      formattedLines.push(indentStr + casedLine);

      // Opening elements increase indent after printing
      const isOpening =
        lowerClean.startsWith("namespace ") ||
        /^(?:public\s+|private\s+|protected\s+)?class\s+/i.test(lowerClean) ||
        /^(?:public\s+|private\s+|protected\s+)?structure\s+/i.test(lowerClean) ||
        /^(?:public\s+|private\s+|protected\s+)?property\s+/i.test(lowerClean) ||
        (/^(?:public\s+|private\s+|protected\s+|shared\s+)*sub\s+/i.test(lowerClean) &&
          !lowerClean.includes("declare sub") &&
          !lowerClean.includes("delegate sub")) ||
        (/^(?:public\s+|private\s+|protected\s+|shared\s+)*function\s+/i.test(lowerClean) &&
          !lowerClean.includes("declare function") &&
          !lowerClean.includes("delegate function")) ||
        /^\s*if\s+.*\s+then$/i.test(lowerClean) ||
        lowerClean.startsWith("for ") ||
        lowerClean.startsWith("do ") ||
        lowerClean === "do" ||
        lowerClean.startsWith("try") ||
        lowerClean.startsWith("select case ") ||
        lowerClean === "get" ||
        lowerClean === "set" ||
        lowerClean === "else" ||
        lowerClean.startsWith("elseif ") ||
        lowerClean.startsWith("elseif\t") ||
        lowerClean.startsWith("catch ") ||
        lowerClean.startsWith("catch\t") ||
        lowerClean === "catch" ||
        lowerClean.startsWith("finally") ||
        lowerClean === "finally";

      if (isOpening) {
        indentLevel++;
      }
    }

    return formattedLines.join("\n");
  }
}

export class D7BasicFormattingProvider implements vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    if (token.isCancellationRequested) return undefined;
    const text = document.getText();
    const formatted = CodeFormatter.formatCode(text);

    const lastLine = document.lineCount - 1;
    const lastLineRange = document.lineAt(lastLine).range;
    const fullRange = new vscode.Range(new vscode.Position(0, 0), lastLineRange.end);

    return [vscode.TextEdit.replace(fullRange, formatted)];
  }
}
