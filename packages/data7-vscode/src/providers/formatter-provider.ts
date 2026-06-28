import * as vscode from "vscode";
import { tokenizeLine } from "../project/parser/lexer";
import { LANGUAGE_KEYWORD_CASING } from "../project/language/keywords";

const keywordCasingMap = new Map<string, string>(LANGUAGE_KEYWORD_CASING);
keywordCasingMap.set("me", "me");

export interface CodeFormatterOptions {
  readonly insertSpaces?: boolean;
  readonly tabSize?: number;
}

type IndentFrame =
  | "namespace"
  | "class"
  | "structure"
  | "enum"
  | "enun"
  | "property"
  | "get"
  | "set"
  | "sub"
  | "function"
  | "if"
  | "select"
  | "case"
  | "for"
  | "do"
  | "while"
  | "try"
  | "using"
  | "with";

const DEFAULT_TAB_SIZE = 4;
const DECLARATION_MODIFIERS =
  "(?:(?:public|private|protected|shared|overrides|overridable|readonly)\\s+)*";

export class CodeFormatter {
  public static formatKeywordsInLine(lineText: string): string {
    return tokenizeLine(lineText, { includeWhitespace: true })
      .map((token) => keywordCasingMap.get(token.value.toLowerCase()) ?? token.value)
      .join("");
  }

  public static formatCode(text: string, options: CodeFormatterOptions = {}): string {
    const lines = text.split(/\r?\n/);
    const formattedLines: string[] = [];
    const indentStack: IndentFrame[] = [];
    const indentUnit = getIndentUnit(options);

    for (const lineText of lines) {
      const trimmed = lineText.trim();
      if (!trimmed) {
        formattedLines.push("");
        continue;
      }

      const cleanLine = stripTrailingComment(trimmed);
      const lowerClean = cleanLine.toLowerCase();
      let handledIndent = false;

      if (isCaseLine(lowerClean)) {
        popIfTop(indentStack, ["case"]);
        formattedLines.push(
          indentUnit.repeat(indentStack.length) + this.formatKeywordsInLine(trimmed),
        );
        indentStack.push("case");
        handledIndent = true;
      } else {
        const branchDepth = getBranchDepth(lowerClean, indentStack);
        if (branchDepth !== undefined) {
          formattedLines.push(indentUnit.repeat(branchDepth) + this.formatKeywordsInLine(trimmed));
          handledIndent = true;
        } else {
          const closingFrame = getClosingFrame(lowerClean);
          if (closingFrame) {
            closeFrame(indentStack, closingFrame);
          }
        }
      }

      if (!handledIndent) {
        formattedLines.push(
          indentUnit.repeat(indentStack.length) + this.formatKeywordsInLine(trimmed),
        );
      }

      const openingFrame = getOpeningFrame(lowerClean);
      if (openingFrame) {
        indentStack.push(openingFrame);
      }
    }

    return formattedLines.join("\n");
  }
}

export class D7BasicFormattingProvider implements vscode.DocumentFormattingEditProvider {
  public provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    if (token.isCancellationRequested) return undefined;
    const text = document.getText();
    const formatted = CodeFormatter.formatCode(text, options);

    const lastLine = document.lineCount - 1;
    const lastLineRange = document.lineAt(lastLine).range;
    const fullRange = new vscode.Range(new vscode.Position(0, 0), lastLineRange.end);

    return [vscode.TextEdit.replace(fullRange, formatted)];
  }
}

function getIndentUnit(options: CodeFormatterOptions): string {
  if (options.insertSpaces === false) return "\t";

  const requestedTabSize = options.tabSize;
  const tabSize =
    typeof requestedTabSize === "number" &&
    Number.isInteger(requestedTabSize) &&
    requestedTabSize > 0
      ? requestedTabSize
      : DEFAULT_TAB_SIZE;
  return " ".repeat(tabSize);
}

function stripTrailingComment(line: string): string {
  const tokens = tokenizeLine(line, { includeWhitespace: true });
  const commentIndex = tokens.findIndex((token) => token.kind === "comment");
  const codeTokens = commentIndex === -1 ? tokens : tokens.slice(0, commentIndex);
  return codeTokens
    .map((token) => token.value)
    .join("")
    .trim();
}

function getOpeningFrame(lowerClean: string): IndentFrame | undefined {
  if (lowerClean.startsWith("namespace ")) return "namespace";
  if (new RegExp(`^${DECLARATION_MODIFIERS}class\\s+`).test(lowerClean)) return "class";
  if (new RegExp(`^${DECLARATION_MODIFIERS}structure\\s+`).test(lowerClean)) return "structure";
  if (new RegExp(`^${DECLARATION_MODIFIERS}enum\\s+`).test(lowerClean)) return "enum";
  if (new RegExp(`^${DECLARATION_MODIFIERS}enun\\s+`).test(lowerClean)) return "enun";
  if (new RegExp(`^${DECLARATION_MODIFIERS}property\\s+`).test(lowerClean)) return "property";
  if (isSubDeclaration(lowerClean)) return "sub";
  if (isFunctionDeclaration(lowerClean)) return "function";
  if (/^if\s+/i.test(lowerClean)) {
    const thenIndex = lowerClean.indexOf(" then");
    if (thenIndex !== -1) {
      const afterThen = lowerClean.substring(thenIndex + 5).trim();
      if (afterThen.length > 0 && afterThen !== ":") {
        return undefined; // Single-line If, don't open block
      }
    }
    return "if";
  }
  if (lowerClean.startsWith("select case ")) return "select";
  if (lowerClean.startsWith("for ")) return "for";
  if (lowerClean === "do" || lowerClean.startsWith("do ")) return "do";
  if (lowerClean.startsWith("while ")) return "while";
  if (lowerClean === "try") return "try";
  if (lowerClean.startsWith("using ")) return "using";
  if (lowerClean.startsWith("with ")) return "with";
  if (lowerClean === "get") return "get";
  if (lowerClean === "set" || lowerClean.startsWith("set(")) return "set";
  return undefined;
}

function isSubDeclaration(lowerClean: string): boolean {
  return new RegExp(`^${DECLARATION_MODIFIERS}sub\\s+`).test(lowerClean);
}

function isFunctionDeclaration(lowerClean: string): boolean {
  return new RegExp(`^${DECLARATION_MODIFIERS}function\\s+`).test(lowerClean);
}

function getClosingFrame(lowerClean: string): IndentFrame[] | undefined {
  if (lowerClean.startsWith("next ")) return ["for"];
  if (lowerClean.startsWith("loop ")) return ["do"];

  switch (lowerClean) {
    case "end namespace":
      return ["namespace"];
    case "end class":
      return ["class"];
    case "end structure":
      return ["structure"];
    case "end enum":
      return ["enum"];
    case "end enun":
      return ["enun"];
    case "end property":
      return ["property"];
    case "end get":
      return ["get"];
    case "end set":
      return ["set"];
    case "end sub":
      return ["sub"];
    case "end function":
      return ["function"];
    case "end if":
      return ["if"];
    case "next":
      return ["for"];
    case "loop":
      return ["do"];
    case "end while":
      return ["while"];
    case "end try":
      return ["try"];
    case "end select":
      return ["select"];
    case "end using":
      return ["using"];
    case "end with":
      return ["with"];
    default:
      return undefined;
  }
}

function getBranchDepth(
  lowerClean: string,
  indentStack: readonly IndentFrame[],
): number | undefined {
  if (
    lowerClean === "else" ||
    lowerClean.startsWith("elseif ") ||
    lowerClean.startsWith("elseif\t") ||
    lowerClean.startsWith("else if ") ||
    lowerClean.startsWith("else if\t") ||
    lowerClean === "catch" ||
    lowerClean.startsWith("catch ") ||
    lowerClean.startsWith("catch\t") ||
    lowerClean === "finally"
  ) {
    return Math.max(0, indentStack.length - 1);
  }

  return undefined;
}

function isCaseLine(lowerClean: string): boolean {
  return lowerClean === "case" || lowerClean.startsWith("case ") || lowerClean.startsWith("case\t");
}

function closeFrame(indentStack: IndentFrame[], frames: readonly IndentFrame[]): void {
  for (const frame of frames) {
    if (frame === "select") {
      popIfTop(indentStack, ["case"]);
    }
    popFrame(indentStack, frame);
  }
}

function popIfTop(indentStack: IndentFrame[], frames: readonly IndentFrame[]): void {
  const top = indentStack[indentStack.length - 1];
  if (top && frames.includes(top)) {
    indentStack.pop();
  }
}

function popFrame(indentStack: IndentFrame[], frame: IndentFrame): void {
  if (indentStack[indentStack.length - 1] === frame) {
    indentStack.pop();
    return;
  }

  const index = indentStack.lastIndexOf(frame);
  if (index !== -1) {
    indentStack.splice(index, 1);
    return;
  }

  if (indentStack.length > 0) {
    indentStack.pop();
  }
}
