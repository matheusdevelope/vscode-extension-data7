import * as vscode from "vscode";
import {
  SugarTranspiler,
  TypeResolver,
  WorkspaceSymbolIndexer,
  detectEnumerable,
} from "@data7/core";

/**
 * `Converter For Each em For clássico`: replaces the sugar header at the
 * cursor with the same expansion the Builder would emit (`For <idx> = 0 To
 * <src>.Count - 1` + a synthetic `Dim <var> As <Type> = <src>.<Indexer>(<idx>)`).
 *
 * The action is only offered when the operand resolves to an enumerable
 * (Count + integer-indexer pair). Reuses {@link SugarTranspiler.transpile}
 * on the single-line range so the expansion stays in lockstep with the
 * build-time output — drift between Code Action and Builder is impossible.
 */
export function addConvertForEachToClassicAction(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  range: vscode.Range | vscode.Selection,
): void {
  const line = range.start.line;
  const lineText = document.lineAt(line).text;
  const match = /^(\s*)For\s+Each\s+(\w+)(?:\s+As\s+([\w.]+))?\s+In\s+([A-Za-z_]\w*)\b/i.exec(
    lineText,
  );
  if (!match) return;

  const indexer = WorkspaceSymbolIndexer.getInstance();
  const ctx = {
    detectEnumerable: (typeName: string, preferredElementType?: string) =>
      detectEnumerable(
        typeName,
        (t) => TypeResolver.getAllMembersForType(t, indexer),
        preferredElementType,
      ),
  };

  // The transpiler infers the operand type by walking previous lines, so
  // we pass the document text from (0, 0) up to and including the For Each
  // line. Slicing to `(line, lineText.length)` keeps the input deterministic
  // and avoids feeding the transpiler unrelated content past the cursor.
  const sliceText = document.getText(new vscode.Range(0, 0, line, lineText.length));
  const sliceLineCount = sliceText.split(/\r?\n/).length;
  const { code: transpiled, diagnostics } = SugarTranspiler.transpile(sliceText, ctx);
  if (diagnostics.length > 0) return; // operand wasn't enumerable — no action

  const transpiledLines = transpiled.split(/\r?\n/);
  // The transpiler injects exactly 2 lines per For Each (Dim + For), or 3
  // when a `__src` temp is needed. If nothing was expanded, bail out.
  if (transpiledLines.length <= sliceLineCount) return;
  const expansionLines = transpiledLines.slice(line);
  const replacement = expansionLines.join(document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n");

  const action = new vscode.CodeAction(
    "Converter For Each em For clássico",
    vscode.CodeActionKind.RefactorRewrite,
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(line, 0, line, lineText.length), replacement);
  action.edit = edit;
  actions.push(action);
}

/**
 * `Converter For clássico em For Each`: detects the canonical
 * `For <idx> = 0 To <operand>.Count - 1` followed immediately by
 * `Dim <var> As <Type> = <operand>.<Indexer>(<idx>)` and collapses both
 * lines into a single `For Each <var> As <Type> In <operand>`.
 *
 * The action is conservative: it only triggers when the next non-blank
 * line matches the exact "Dim element = operand.indexer(idx)" idiom. This
 * keeps the action's behaviour predictable and avoids guessing the loop
 * variable name when the user has structured their body differently.
 */
export function addConvertClassicForToForEachAction(
  actions: vscode.CodeAction[],
  document: vscode.TextDocument,
  range: vscode.Range | vscode.Selection,
): void {
  const line = range.start.line;
  const lineText = document.lineAt(line).text;
  const forMatch =
    /^(\s*)For\s+(\w+)\s*=\s*0\s+To\s+([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*-\s*1\b/i.exec(lineText);
  if (!forMatch) return;

  const leadingIndent = forMatch[1] ?? "";
  const idxVar = forMatch[2];
  const operandName = forMatch[3];
  const countMember = forMatch[4];
  if (!idxVar || !operandName || !countMember) return;
  if (countMember.toLowerCase() !== "count") return;

  // Look at the next non-blank line for the synthetic Dim binding.
  let nextLine = line + 1;
  while (nextLine < document.lineCount && document.lineAt(nextLine).text.trim() === "") {
    nextLine++;
  }
  if (nextLine >= document.lineCount) return;

  const nextLineText = document.lineAt(nextLine).text;
  const dimMatch = new RegExp(
    `^\\s*Dim\\s+(\\w+)\\s+As\\s+([\\w.]+)\\s*=\\s*${operandName}\\.([A-Za-z_]\\w*)\\s*\\(\\s*${idxVar}\\s*\\)\\s*$`,
    "i",
  ).exec(nextLineText);
  if (!dimMatch) return;

  const elementVar = dimMatch[1];
  const elementType = dimMatch[2];
  const indexerMember = dimMatch[3];
  if (!elementVar || !elementType || !indexerMember) return;

  // Validate that operandName actually exposes the (Count, indexer) pair.
  const indexer = WorkspaceSymbolIndexer.getInstance();
  const operandType = TypeResolver.getVariableType(
    operandName,
    document,
    new vscode.Position(Math.max(0, line - 1), 0),
    indexer,
  );
  if (!operandType) return;

  const enumerable = detectEnumerable(
    operandType,
    (t) => TypeResolver.getAllMembersForType(t, indexer),
    elementType,
  );
  if (!enumerable) return;
  if (enumerable.indexerMember.toLowerCase() !== indexerMember.toLowerCase()) return;

  const replacement = `${leadingIndent}For Each ${elementVar} As ${elementType} In ${operandName}`;
  const action = new vscode.CodeAction(
    `Converter For em For Each (${operandType})`,
    vscode.CodeActionKind.RefactorRewrite,
  );
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(line, 0, nextLine, nextLineText.length), replacement);
  action.edit = edit;
  actions.push(action);
}
