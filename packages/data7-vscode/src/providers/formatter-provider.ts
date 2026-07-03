import * as vscode from "vscode";
import { LANGUAGE_KEYWORD_CASING, tokenizeLine } from "@data7/core";

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

type ExpressionFrame = "paren" | "bracket" | "continuation";

const DEFAULT_TAB_SIZE = 4;
const DECLARATION_MODIFIERS =
  "(?:(?:public|private|protected|shared|overrides|overridable|readonly|shadows|mustoverride|mustinherit|notinheritable)\\s+)*";

export class CodeFormatter {
  public static formatKeywordsInLine(lineText: string): string {
    return tokenizeLine(lineText, { includeWhitespace: true })
      .map((token) => keywordCasingMap.get(token.value.toLowerCase()) ?? token.value)
      .join("");
  }

  public static formatCode(text: string, options: CodeFormatterOptions = {}): string {
    const lines = expandFormatterLines(text.split(/\r?\n/));
    const formattedLines: string[] = [];
    const indentStack: IndentFrame[] = [];
    const expressionStack: ExpressionFrame[] = [];
    const indentUnit = getIndentUnit(options);

    for (const lineText of lines) {
      const trimmed = lineText.trim();
      if (!trimmed) {
        formattedLines.push("");
        continue;
      }

      const cleanLine = stripTrailingComment(trimmed);
      const lowerClean = cleanLine.toLowerCase();
      const continuationDepth = getContinuationDepthForLine(expressionStack, cleanLine);
      let handledIndent = false;

      if (isCaseLine(lowerClean)) {
        popIfTop(indentStack, ["case"]);
        formattedLines.push(
          indentUnit.repeat(indentStack.length + continuationDepth) +
            this.formatKeywordsInLine(trimmed),
        );
        indentStack.push("case");
        handledIndent = true;
      } else {
        const branchDepth = getBranchDepth(lowerClean, indentStack);
        if (branchDepth !== undefined) {
          formattedLines.push(
            indentUnit.repeat(branchDepth + continuationDepth) + this.formatKeywordsInLine(trimmed),
          );
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
          indentUnit.repeat(indentStack.length + continuationDepth) +
            this.formatKeywordsInLine(trimmed),
        );
      }

      const openingFrame = getOpeningFrame(lowerClean);
      if (openingFrame) {
        indentStack.push(openingFrame);
      }
      updateExpressionStack(expressionStack, cleanLine);
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

function expandFormatterLines(lines: readonly string[]): string[] {
  const expandedLines: string[] = [];
  for (const line of lines) {
    for (const endSplitLine of splitLambdaEndWithCallClose(line)) {
      expandedLines.push(...splitInlineBlockLambdaStart(endSplitLine));
    }
  }
  return expandedLines;
}

function splitInlineBlockLambdaStart(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [line];

  const cleanLine = stripTrailingComment(trimmed);
  const trailingComment = getTrailingComment(trimmed, cleanLine);
  const match = cleanLine.match(
    /^(.*(?:\(|,))\s*((?:sub|function)\s*\([^)]*\)(?:\s+as\s+[a-z_][a-z0-9_.]*(?:<[^>]+>)?(?:\[\])?)?)\s*$/i,
  );
  if (!match) return [line];

  const prefix = match[1]?.trimEnd();
  const lambdaHeader = match[2]?.trim();
  if (!prefix || !lambdaHeader || !isBlockLambdaHeader(lambdaHeader.toLowerCase())) {
    return [line];
  }

  return [prefix, trailingComment ? `${lambdaHeader} ${trailingComment}` : lambdaHeader];
}

function splitLambdaEndWithCallClose(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [line];

  const cleanLine = stripTrailingComment(trimmed);
  const trailingComment = getTrailingComment(trimmed, cleanLine);
  const match = cleanLine.match(/^(end\s+(?:sub|function))\s*([)\]]+)\s*$/i);
  if (!match) return [line];

  const lambdaEnd = match[1];
  const closingDelimiters = match[2];
  if (!lambdaEnd || !closingDelimiters) return [line];

  return [trailingComment ? `${lambdaEnd} ${trailingComment}` : lambdaEnd, closingDelimiters];
}

function getTrailingComment(trimmedLine: string, cleanLine: string): string {
  if (cleanLine.length >= trimmedLine.length) return "";
  return trimmedLine.slice(cleanLine.length).trimStart();
}

function getOpeningFrame(lowerClean: string): IndentFrame | undefined {
  if (lowerClean.startsWith("namespace ")) return "namespace";
  if (new RegExp(`^${DECLARATION_MODIFIERS}class\\s+`).test(lowerClean)) return "class";
  if (new RegExp(`^${DECLARATION_MODIFIERS}structure\\s+`).test(lowerClean)) return "structure";
  if (new RegExp(`^${DECLARATION_MODIFIERS}enum\\s+`).test(lowerClean)) return "enum";
  if (new RegExp(`^${DECLARATION_MODIFIERS}enun\\s+`).test(lowerClean)) return "enun";
  if (new RegExp(`^${DECLARATION_MODIFIERS}property\\s+`).test(lowerClean)) return "property";
  if (isLambdaBlockDeclaration(lowerClean, "sub")) return "sub";
  if (isLambdaBlockDeclaration(lowerClean, "function")) return "function";
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
  if (lowerClean.startsWith("select ")) return "select";
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

function isLambdaBlockDeclaration(lowerClean: string, kind: "sub" | "function"): boolean {
  return isBlockLambdaHeader(lowerClean, kind);
}

function isBlockLambdaHeader(lowerClean: string, kind?: "sub" | "function"): boolean {
  if (kind === "sub") {
    return /^sub\s*\([^)]*\)\s*$/.test(lowerClean);
  }
  if (kind === "function") {
    return /^function\s*\([^)]*\)(?:\s+as\s+[a-z_][a-z0-9_.]*(?:<[^>]+>)?(?:\[\])?)?\s*$/.test(
      lowerClean,
    );
  }
  return isBlockLambdaHeader(lowerClean, "sub") || isBlockLambdaHeader(lowerClean, "function");
}

function getClosingFrame(lowerClean: string): IndentFrame[] | undefined {
  if (lowerClean.startsWith("next ")) return ["for"];
  if (lowerClean.startsWith("loop ")) return ["do"];
  if (/^end\s+function\s*,?\s*$/.test(lowerClean)) return ["function"];
  if (/^end\s+sub\s*,?\s*$/.test(lowerClean)) return ["sub"];

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

function getContinuationDepthForLine(
  expressionStack: readonly ExpressionFrame[],
  cleanLine: string,
): number {
  let depth = expressionStack.length;
  const leadingClosers = getLeadingClosingDelimiters(cleanLine);
  for (const char of leadingClosers) {
    if (char !== ")" && char !== "]") break;
    if (depth === 0) break;
    const expectedFrame = char === ")" ? "paren" : "bracket";
    const matchingIndex = findLastFrameIndex(expressionStack.slice(0, depth), expectedFrame);
    if (matchingIndex === -1) break;
    depth--;
  }
  return Math.max(0, depth);
}

function getLeadingClosingDelimiters(cleanLine: string): string {
  const trimmed = cleanLine.trimStart();
  const lambdaEndMatch = trimmed.match(/^end\s+(?:sub|function)\s*([)\]\s,]*)$/i);
  if (lambdaEndMatch) {
    return lambdaEndMatch[1] ?? "";
  }
  return trimmed;
}

function updateExpressionStack(expressionStack: ExpressionFrame[], cleanLine: string): void {
  if (!cleanLine) {
    return;
  }

  const tokens = tokenizeLine(cleanLine, { includeWhitespace: true });
  for (const token of tokens) {
    if (token.kind !== "punct") continue;
    switch (token.value) {
      case "(":
        expressionStack.push("paren");
        break;
      case "[":
        expressionStack.push("bracket");
        break;
      case ")":
        popExpressionFrame(expressionStack, "paren");
        break;
      case "]":
        popExpressionFrame(expressionStack, "bracket");
        break;
    }
  }

  if (endsWithContinuation(cleanLine)) {
    if (!expressionStack.includes("continuation")) {
      expressionStack.unshift("continuation");
    }
    return;
  }

  if (!expressionStack.some((frame) => frame === "paren" || frame === "bracket")) {
    removeContinuationFrames(expressionStack);
  }
}

function endsWithContinuation(cleanLine: string): boolean {
  const trimmed = cleanLine.trimEnd();
  return trimmed.endsWith(".") || trimmed.endsWith("_");
}

function popExpressionFrame(expressionStack: ExpressionFrame[], frame: ExpressionFrame): void {
  const index = findLastFrameIndex(expressionStack, frame);
  if (index !== -1) {
    expressionStack.splice(index, 1);
  }
}

function findLastFrameIndex(
  expressionStack: readonly ExpressionFrame[],
  frame: ExpressionFrame,
): number {
  for (let i = expressionStack.length - 1; i >= 0; i--) {
    if (expressionStack[i] === frame) return i;
  }
  return -1;
}

function removeContinuationFrames(expressionStack: ExpressionFrame[]): void {
  for (let i = expressionStack.length - 1; i >= 0; i--) {
    if (expressionStack[i] === "continuation") {
      expressionStack.splice(i, 1);
    }
  }
}
