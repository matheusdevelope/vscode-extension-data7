import * as vscode from "vscode";
import { ASTWalker, DiagnosticCodes, LanguageProcessor, deepClone, getCommentStartIndex, serializeUnit } from "@data7/core";
import type { CompilationUnit, IfStatement, Node } from "@data7/core";

import { dedupeDiagnostics, hasDiagnosticCode } from "../code-action-helpers";

export function addInlineIfThenFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const resolved = resolveInlineIfReplacement(document, diagnostic);
  if (!resolved) return;

  const action = new vscode.CodeAction(
    "Converter 'If' inline em bloco 'If ... Then ... End If'",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, resolved.range, resolved.replacement);
  action.edit = edit;
  actions.push(action);
}

export function addInlineIfThenBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const allDiags = vscode.languages.getDiagnostics(document.uri);
  const matches = dedupeDiagnostics([
    diagnostic,
    ...allDiags.filter((d) => hasDiagnosticCode(d, DiagnosticCodes.InlineIfThen)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Converter todos os 'If' inline em bloco neste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const sorted = [...matches].sort((a, b) => b.range.start.line - a.range.start.line);
  const edit = new vscode.WorkspaceEdit();
  let replacementCount = 0;

  for (const match of sorted) {
    const resolved = resolveInlineIfReplacement(document, match);
    if (!resolved) continue;
    edit.replace(document.uri, resolved.range, resolved.replacement);
    replacementCount++;
  }

  if (replacementCount === 0) return;
  action.edit = edit;
  actions.push(action);
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

function getDocumentEol(document: vscode.TextDocument): string {
  if ((document.eol as unknown) === 1) return "\n";
  return document.getText().includes("\r\n") ? "\r\n" : "\n";
}

function resolveInlineIfReplacement(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): { range: vscode.Range; replacement: string } | undefined {
  const line = diagnostic.range.start.line;
  if (line < 0 || line >= document.lineCount) return undefined;

  const lineText = document.lineAt(line).text;
  const indent = lineText.substring(0, lineText.length - lineText.trimStart().length);

  const cachedDoc = LanguageProcessor.getInstance().getOrParse(
    document.uri.toString(),
    document.getText(),
  );
  const resolver = new InlineIfResolver(line);
  resolver.walk(cachedDoc.unit);

  const foundIf = resolver.foundIf;
  if (!foundIf) return undefined;

  const ifNode = deepClone(foundIf);
  ifNode.singleLine = false;

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

    // Handle comments
    const commentIdx = getCommentStartIndex(lineText);
    if (commentIdx !== -1) {
      const commentSuffix = lineText.slice(commentIdx).trim();
      if (commentSuffix && unindented[0] !== undefined && !unindented[0].includes("'")) {
        unindented[0] = unindented[0] + " " + commentSuffix;
      }
    }

    const replacement = unindented.map((l) => indent + l).join(eol);
    return {
      range: new vscode.Range(line, 0, line, lineText.length),
      replacement,
    };
  }

  return undefined;
}
