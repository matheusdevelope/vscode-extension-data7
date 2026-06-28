import * as vscode from "vscode";
import {
  DiagnosticCodes,
  type ReturnUnrecommendedPayload,
} from "../../diagnostics/diagnostic-codes";
import { hasDiagnosticCode, readDiagnosticPayload } from "../code-action-helpers";
import { LanguageProcessor } from "../../analysis/language-processor";
import {
  ASTWalker,
  type Node,
  type MethodDeclaration,
  type PropertyDeclaration,
  type IfStatement,
  type Statement,
  type CompilationUnit,
} from "../../project/ast/ast";
import { deepClone } from "../../project/ast/clone";
import { serializeUnit } from "../../project/parser/serializer";

export function addReturnUnrecommendedFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const payload =
    readDiagnosticPayload<ReturnUnrecommendedPayload>(
      diagnostic,
      DiagnosticCodes.ReturnUnrecommended,
    ) ?? resolveReturnPayloadFromDocument(document, diagnostic);

  // Adicionada a restrição para ignorar 'Property'
  if (!payload || payload.exitType === "Property") return;

  const resolved = resolveReturnUnrecommendedReplacement(document, diagnostic, payload);

  if (!resolved) return;

  const label =
    payload.targetName && resolved.replacement.includes("=")
      ? payload.isConditional
        ? `Substituir por atribuicao a '${payload.targetName}' e Exit ${payload.exitType}`
        : `Substituir por atribuicao a '${payload.targetName}'`
      : `Substituir por 'Exit ${payload.exitType}'`;
  const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, resolved.range, resolved.replacement);
  action.edit = edit;
  actions.push(action);
}

export function addReturnUnrecommendedBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = vscode.languages
    .getDiagnostics(document.uri)
    .filter((candidate) => hasDiagnosticCode(candidate, DiagnosticCodes.ReturnUnrecommended));
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Substituir todos os 'Return' por atribuicao/Exit neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  const sorted = [...matches].sort((left, right) => right.range.start.line - left.range.start.line);

  let replacementCount = 0;
  for (const match of sorted) {
    const payload =
      readDiagnosticPayload<ReturnUnrecommendedPayload>(
        match,
        DiagnosticCodes.ReturnUnrecommended,
      ) ?? resolveReturnPayloadFromDocument(document, match);

    // Adicionada a restrição para pular 'Property' no bulk fix
    if (!payload || payload.exitType === "Property") continue;

    const resolved = resolveReturnUnrecommendedReplacement(document, match, payload);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }

  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

class ReturnPayloadResolver extends ASTWalker {
  private activeMethod: MethodDeclaration | undefined;
  private activeProperty: PropertyDeclaration | undefined;
  private conditionalDepth = 0;
  private foundPayload: ReturnUnrecommendedPayload | undefined;

  constructor(private readonly targetLine: number) {
    super();
  }

  public getPayload(): ReturnUnrecommendedPayload | undefined {
    return this.foundPayload;
  }

  public override walk(node: Node): void {
    if (node.loc) {
      const startL = node.loc.startLine - 1;
      const endL = node.loc.endLine - 1;
      if (this.targetLine < startL || this.targetLine > endL) {
        return;
      }
    }

    const prevMethod = this.activeMethod;
    const prevProp = this.activeProperty;
    let isConditional = false;

    if (node.kind === "MethodDeclaration") {
      this.activeMethod = node;
    } else if (node.kind === "PropertyDeclaration") {
      this.activeProperty = node;
    } else if (node.kind === "IfStatement" || node.kind === "SelectCaseStatement") {
      isConditional = true;
      this.conditionalDepth++;
    } else if (node.kind === "ReturnStatement") {
      const inProperty = !!this.activeProperty;
      const inFunction = !!this.activeMethod && !!this.activeMethod.returnType;

      const targetName = inProperty
        ? this.activeProperty?.name
        : inFunction
          ? this.activeMethod?.name
          : undefined;
      const exitType: "Sub" | "Function" | "Property" = inProperty
        ? "Property"
        : inFunction
          ? "Function"
          : "Sub";

      this.foundPayload = {
        code: DiagnosticCodes.ReturnUnrecommended,
        line: this.targetLine,
        startChar: node.loc?.startChar ?? 0,
        endChar: node.loc?.endChar ?? 0,
        expressionText: undefined,
        exitType,
        targetName,
        isConditional: this.conditionalDepth > 0,
      };
      return;
    }

    super.walk(node);

    if (node.kind === "MethodDeclaration") {
      this.activeMethod = prevMethod;
    } else if (node.kind === "PropertyDeclaration") {
      this.activeProperty = prevProp;
    } else if (isConditional) {
      this.conditionalDepth--;
    }
  }
}

/**
 * Rebuild only the syntactic replacement metadata from the enclosing AST routine
 * and source line, never using regex scanning over the code.
 */
function resolveReturnPayloadFromDocument(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): ReturnUnrecommendedPayload | undefined {
  const line = diagnostic.range.start.line;
  if (line < 0 || line >= document.lineCount) return undefined;

  const cachedDoc = LanguageProcessor.getInstance().getOrParse(
    document.uri.toString(),
    document.getText(),
  );
  const resolver = new ReturnPayloadResolver(line);
  resolver.walk(cachedDoc.unit);
  return resolver.getPayload();
}

class InlineIfResolver extends ASTWalker {
  public foundIf: IfStatement | undefined;

  constructor(private readonly targetLine: number) {
    super();
  }

  public override walk(node: Node): void {
    if (node.loc) {
      const startL = node.loc.startLine - 1;
      const endL = node.loc.endLine - 1;
      if (this.targetLine < startL || this.targetLine > endL) {
        return;
      }
    }

    if (node.kind === "IfStatement" && node.singleLine) {
      this.foundIf = node;
    }

    super.walk(node);
  }
}

function resolveReturnUnrecommendedReplacement(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
  payload: ReturnUnrecommendedPayload,
): { range: vscode.Range; replacement: string } | undefined {
  const line = Math.max(0, Math.min(payload.line, document.lineCount - 1));
  const lineText = document.lineAt(line).text;
  const indent = lineText.substring(0, lineText.length - lineText.trimStart().length);
  const returnStart = findReturnKeywordColumn(lineText, payload.startChar, diagnostic, line);
  const commentStart = findInlineCommentColumn(lineText, returnStart);
  const codeEnd = commentStart === -1 ? lineText.length : commentStart;
  const commentSuffix = commentStart === -1 ? "" : lineText.slice(commentStart);
  const expressionText =
    payload.expressionText !== undefined && payload.expressionText.trim().length > 0
      ? payload.expressionText.trim()
      : lineText.slice(Math.min(codeEnd, returnStart + "Return".length), codeEnd).trim();

  if (payload.isSingleLineIf) {
    const cachedDoc = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const resolver = new InlineIfResolver(line);
    resolver.walk(cachedDoc.unit);
    const foundIf = resolver.foundIf;
    if (foundIf) {
      const ifNode = deepClone(foundIf);
      ifNode.singleLine = false;

      const replaceReturnInList = (list: Statement[]): Statement[] => {
        const newList: Statement[] = [];
        for (const stmt of list) {
          if (stmt.kind === "ReturnStatement" && stmt.loc?.startChar === payload.startChar) {
            if (payload.targetName && expressionText.length > 0) {
              newList.push({
                kind: "Assignment",
                target: {
                  kind: "Identifier",
                  name: payload.targetName,
                  loc: stmt.loc,
                },
                value: stmt.expression
                  ? deepClone(stmt.expression)
                  : {
                      kind: "Literal",
                      value: expressionText,
                      loc: stmt.loc,
                    },
                loc: stmt.loc,
              });
            }
            newList.push({
              kind: "ExitStatement",
              target: payload.exitType,
              loc: stmt.loc,
            });
          } else {
            newList.push(stmt);
          }
        }
        return newList;
      };

      ifNode.thenBranch = replaceReturnInList(ifNode.thenBranch);
      if (ifNode.elseBranch) {
        ifNode.elseBranch = replaceReturnInList(ifNode.elseBranch);
      }

      const eol = getDocumentEol(document);
      const syntheticUnit: CompilationUnit = {
        kind: "CompilationUnit",
        members: [
          {
            kind: "MethodDeclaration",
            name: "__synth",
            modifiers: [],
            parameters: [],
            typeParameters: [],
            body: [ifNode],
            loc: undefined,
          },
        ],
        loc: undefined,
      };

      const serialized = serializeUnit(syntheticUnit, { eol });
      const lines = serialized.split(/\r?\n/);
      const startIdx = lines.findIndex((l) => l.includes("Sub __synth()"));
      const endIdx = lines.findIndex((l) => l.includes("End Sub"));

      if (startIdx !== -1 && endIdx > startIdx) {
        const bodyLines = lines.slice(startIdx + 1, endIdx);
        const unindented = bodyLines.map((l) => (l.startsWith("   ") ? l.substring(3) : l));

        if (commentSuffix && unindented[0] !== undefined && !unindented[0].includes("'")) {
          unindented[0] = unindented[0] + " " + commentSuffix.trim();
        }

        const replacement = unindented.map((l) => indent + l).join(eol);
        return {
          range: new vscode.Range(line, 0, line, lineText.length),
          replacement,
        };
      }
    }
  }

  if (!payload.targetName || expressionText.length === 0) {
    return {
      range: new vscode.Range(line, returnStart, line, lineText.length),
      replacement: `Exit ${payload.exitType}${commentSuffix ? ` ${commentSuffix}` : ""}`,
    };
  }

  const assignment = `${payload.targetName} = ${expressionText}${commentSuffix ? ` ${commentSuffix}` : ""}`;
  const replacement = payload.isConditional
    ? `${assignment}${getDocumentEol(document)}${indent}Exit ${payload.exitType}`
    : assignment;

  return {
    range: new vscode.Range(line, returnStart, line, lineText.length),
    replacement,
  };
}

function findReturnKeywordColumn(
  lineText: string,
  fallbackStartChar: number,
  diagnostic: vscode.Diagnostic,
  line: number,
): number {
  const directMatch = /\breturn\b/i.exec(lineText);
  if (directMatch) return directMatch.index;

  if (
    diagnostic.range.start.line === line &&
    diagnostic.range.end.line === line &&
    diagnostic.range.start.character < lineText.length
  ) {
    return diagnostic.range.start.character;
  }
  return Math.max(0, Math.min(fallbackStartChar, lineText.length));
}

function findInlineCommentColumn(lineText: string, startColumn: number): number {
  let inString = false;
  for (let index = startColumn; index < lineText.length; index++) {
    const char = lineText[index];
    if (char === '"') {
      if (inString && lineText[index + 1] === '"') {
        index++;
        continue;
      }
      inString = !inString;
      continue;
    }
    if (!inString && char === "'") return index;
  }
  return -1;
}

function getDocumentEol(document: vscode.TextDocument): string {
  if ((document.eol as unknown) === 1) return "\n";
  return document.getText().includes("\r\n") ? "\r\n" : "\n";
}
