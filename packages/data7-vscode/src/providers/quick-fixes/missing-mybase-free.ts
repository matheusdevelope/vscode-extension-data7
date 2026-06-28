import * as vscode from "vscode";
import { ASTWalker, DiagnosticCodes, LanguageProcessor, logger } from "@data7/core";
import type { ClassDeclaration, MethodDeclaration, Node } from "@data7/core";

import { dedupeDiagnostics, hasDiagnosticCode } from "../code-action-helpers";

export function addMissingMyBaseFreeFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const action = createMissingMyBaseFreeAction(document, diagnostic);
  if (action) actions.push(action);
}

export function addMissingMyBaseFreeBulkFix(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): void {
  const matches = dedupeDiagnostics([
    diagnostic,
    ...vscode.languages
      .getDiagnostics(document.uri)
      .filter((candidate) => hasDiagnosticCode(candidate, DiagnosticCodes.MissingMyBaseFree)),
  ]);
  if (matches.length <= 1) return;

  const action = new vscode.CodeAction(
    "Corrigir/Gerar chamadas de 'MyBase.Free()' em todas as classes deste arquivo",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];

  const edit = new vscode.WorkspaceEdit();
  let editCount = 0;
  for (const match of [...matches].sort(
    (left, right) => right.range.start.line - left.range.start.line,
  )) {
    const insertion = resolveMissingMyBaseFreeInsertion(document, match);
    if (!insertion) continue;
    edit.insert(document.uri, insertion.position, insertion.text);
    editCount++;
  }

  if (editCount === 0) return;
  action.edit = edit;
  actions.push(action);
}

function createMissingMyBaseFreeAction(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): vscode.CodeAction | undefined {
  const insertion = resolveMissingMyBaseFreeInsertion(document, diagnostic);
  if (!insertion) return undefined;

  const action = new vscode.CodeAction(
    insertion.kind === "method" ? "Gerar método 'Sub Free()'" : "Adicionar chamada 'MyBase.Free()'",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = true;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, insertion.position, insertion.text);
  action.edit = edit;
  return action;
}

function resolveMissingMyBaseFreeInsertion(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): { kind: "method" | "call"; position: vscode.Position; text: string } | undefined {
  const startLine = diagnostic.range.start.line;
  if (startLine < 0 || startLine >= document.lineCount) return undefined;

  let targetClass: ClassDeclaration | undefined;
  let targetMethod: MethodDeclaration | undefined;

  try {
    const cachedDoc = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const finder = new (class extends ASTWalker {
      public override walk(node: Node): void {
        if (node.loc) {
          const startL = node.loc.startLine - 1;
          const endL = node.loc.endLine - 1;
          if (startLine < startL || startLine > endL) return;
        }
        if (node.kind === "ClassDeclaration" && node.loc && node.loc.startLine - 1 === startLine) {
          targetClass = node;
          return;
        }
        if (node.kind === "MethodDeclaration" && node.loc && node.loc.startLine - 1 === startLine) {
          targetMethod = node;
          return;
        }
        super.walk(node);
      }
    })();
    finder.walk(cachedDoc.unit);
  } catch (err) {
    logger.error("Error parsing AST in resolveMissingMyBaseFreeInsertion", err);
    return undefined;
  }

  const lineText = document.lineAt(startLine).text;
  const eol = getDocumentEol(document);

  if (targetClass?.loc) {
    const classIndent = lineText.substring(0, lineText.length - lineText.trimStart().length);
    const endClassLine = targetClass.loc.endLine - 1;
    return {
      kind: "method",
      position: new vscode.Position(endClassLine, 0),
      text: `${classIndent}  Public Sub Free()${eol}${classIndent}    MyBase.Free()${eol}${classIndent}  End Sub${eol}${eol}`,
    };
  }

  if (targetMethod?.loc) {
    const endSubLine = targetMethod.loc.endLine - 1;
    // Determine method body indentation from AST or fallback
    let bodyIndent: string | undefined;
    for (const stmt of targetMethod.body) {
      if (stmt.loc) {
        const stmtLine = stmt.loc.startLine - 1;
        const stmtLineText = document.lineAt(stmtLine).text;
        bodyIndent = stmtLineText.substring(
          0,
          stmtLineText.length - stmtLineText.trimStart().length,
        );
        break;
      }
    }
    if (!bodyIndent) {
      const declIndent = lineText.substring(0, lineText.length - lineText.trimStart().length);
      bodyIndent = declIndent + "  ";
    }
    return {
      kind: "call",
      position: new vscode.Position(endSubLine, 0),
      text: `${bodyIndent}MyBase.Free()${eol}`,
    };
  }

  return undefined;
}

function getDocumentEol(document: vscode.TextDocument): string {
  if ((document.eol as unknown) === 1) return "\n";
  return document.getText().includes("\r\n") ? "\r\n" : "\n";
}
