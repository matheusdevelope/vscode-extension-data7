import * as vscode from "vscode";
import type {
  ModuleNotDeclaredPayload,
  ModuleNotFoundPayload,
  MissingImportPayload,
  UnknownMemberPayload,
  UnknownTypePayload,
  UnsupportedMemberPayload,
  UnusedImportPayload,
  MissingMyBaseFreePayload,
  FinallyBlockUnsupportedPayload,
} from "../diagnostics/diagnostic-codes";
import { DiagnosticCodes } from "../diagnostics/diagnostic-codes";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { detectEnumerable } from "../analysis/enumerable-detector";
import { SugarTranspiler } from "../project/transpiler";
import {
  dedupeDiagnostics,
  extractNamespaceFromMessage,
  findDeclarationParenthesesInsertPosition,
  findImportInsertLine,
  findMissingThenInsertPosition,
  isMissingThenDiagnostic,
  readDiagnosticPayload,
} from "./code-action-helpers";

/**
 * Provides Quick Fixes (lightbulb actions) for every canonical diagnostic
 * emitted by the linter.
 *
 *  - `missing-import`        → "Importar \"X\""
 *  - `unused-import`         → "Remover Imports \"X\""
 *  - `duplicate-import`      → "Remover linha duplicada"
 *  - `module-not-declared`   → "Instalar e declarar módulo \"X\""
 *  - `module-not-found`      → "Instalar módulo \"X\"…"
 *  - `unknown-member`        → "Você quis dizer \"Y\"?" (Levenshtein, até 3)
 *  - `unsupported-member`    → "Comentar esta linha" + "Suprimir warning aqui"
 *
 * Also exposes bulk Source actions (Ctrl+Shift+P → "Source Action…"):
 *  - `source.organizeImports` — sort `Imports` block alphabetically + dedupe.
 *  - `source.fixAll.data7`    — apply every available QuickFix
 *                                (add missing imports + remove unused/duplicate).
 */
export class D7BasicCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorRewrite,
    vscode.CodeActionKind.SourceOrganizeImports,
    vscode.CodeActionKind.SourceFixAll.append("data7"),
  ];

  public provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    if (token.isCancellationRequested) return undefined;

    const actions: vscode.CodeAction[] = [];

    // Per-diagnostic QuickFixes.
    for (const diagnostic of context.diagnostics) {
      const rawCode = diagnostic.code;
      let codeStr: string | undefined;
      if (typeof rawCode === "string") {
        codeStr = rawCode;
      } else if (typeof rawCode === "number") {
        codeStr = String(rawCode);
      } else if (rawCode && typeof rawCode === "object" && "value" in rawCode) {
        codeStr = String(rawCode.value);
      }

      if (codeStr) {
        this.addLineSuppressionFix(actions, document, diagnostic, codeStr);
        this.addFileSuppressionFix(actions, document, diagnostic, codeStr);
      }

      switch (diagnostic.code) {
        case DiagnosticCodes.MissingImport:
          this.addMissingImportFix(actions, document, diagnostic);
          this.addMissingImportBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.UnusedImport:
        case DiagnosticCodes.DuplicateImport:
          this.addRemoveImportFix(actions, document, diagnostic);
          this.addRemoveImportBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.ModuleNotDeclared:
          this.addDeclareDependencyFix(actions, document, diagnostic);
          this.addDeclareDependencyBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.ModuleNotFound:
          this.addInstallModuleFix(actions, diagnostic);
          this.addInstallModuleBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.UnknownMember:
          this.addDidYouMeanFixes(actions, document, diagnostic);
          this.addDidYouMeanBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.UnknownType:
          this.addUnknownTypeDidYouMeanFixes(actions, document, diagnostic);
          this.addUnknownTypeDidYouMeanBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.UnsupportedMember:
          this.addUnsupportedMemberFixes(actions, document, diagnostic);
          this.addUnsupportedMemberBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.DeclarationParenthesesMismatch:
          this.addDeclarationParenthesesMismatchFix(actions, document, diagnostic);
          this.addDeclarationParenthesesMismatchBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.MissingMyBaseNew:
          this.addMissingMyBaseNewFix(actions, document, diagnostic);
          this.addMissingMyBaseNewBulkFix(actions, document, diagnostic);
          break;
        case DiagnosticCodes.MissingMyBaseFree:
          this.addMissingMyBaseFreeFix(actions, document, diagnostic);
          this.addMissingMyBaseFreeBulkFix(actions, document, diagnostic);
          break;
        case "expected-token":
          if (diagnostic.message.toLowerCase().includes("expected 'then'")) {
            this.addMissingThenFix(actions, document, diagnostic);
            this.addMissingThenBulkFix(actions, document, diagnostic);
          }
          break;
        case DiagnosticCodes.FinallyBlockUnsupported:
          this.addFinallyBlockUnsupportedFix(actions, document, diagnostic);
          this.addFinallyBlockUnsupportedBulkFix(actions, document, diagnostic);
          break;
        default:
          break;
      }
    }

    // Cursor-driven refactor rewrites for the `For Each` sugar.
    this.addConvertForEachToClassicAction(actions, document, range);
    this.addConvertClassicForToForEachAction(actions, document, range);

    // Source actions (always available; VS Code filters by `only` when relevant).
    this.addOrganizeImportsAction(actions, document);
    this.addFixAllAction(actions, document, context.diagnostics);

    return actions;
  }

  // -------------------------------------------------------------------------
  // RefactorRewrite — For Each sugar ↔ classic For round-trip
  // -------------------------------------------------------------------------

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
  private addConvertForEachToClassicAction(
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

    // Use the SugarTranspiler on a 1-line slice to guarantee the expansion is
    // byte-identical to what the Builder would produce.
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
  private addConvertClassicForToForEachAction(
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
    edit.replace(
      document.uri,
      new vscode.Range(line, 0, nextLine, nextLineText.length),
      replacement,
    );
    action.edit = edit;
    actions.push(action);
  }

  // -------------------------------------------------------------------------
  // Source actions
  // -------------------------------------------------------------------------

  /**
   * `source.organizeImports` — re-emit the `Imports` block alphabetically and
   * without duplicates, preserving the first occurrence of any blank lines.
   */
  private addOrganizeImportsAction(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
  ): void {
    // Collect contiguous `Imports` lines at the top of the file.
    interface Hit {
      line: number;
      name: string;
      raw: string;
    }
    const hits: Hit[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      const trimmed = text.trim();
      if (trimmed === "") {
        // Allow blank lines inside the imports block — we'll discard them.
        if (hits.length === 0) continue;
        if (hits.length > 0) continue;
      }
      const m = /^\s*Imports\s+([A-Za-z_][\w.]*)\s*$/i.exec(text);
      const importName = m?.[1];
      if (!importName) {
        if (hits.length === 0) continue;
        break; // first non-imports, non-blank line stops the block
      }
      hits.push({ line: i, name: importName, raw: text });
    }
    if (hits.length < 2) return;

    const unique = new Map<string, string>();
    for (const h of hits) {
      const key = h.name.toLowerCase();
      if (!unique.has(key)) unique.set(key, h.name);
    }
    const sorted = Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
    const rewritten = sorted.map((n) => `Imports ${n}`).join("\r\n") + "\r\n";

    // `hits.length >= 2` was just asserted; the `?? hits[0]` guards
    // `noUncheckedIndexedAccess` without changing semantics.
    const firstHit = hits[0];
    const lastHit = hits[hits.length - 1] ?? firstHit;
    if (!firstHit || !lastHit) return;
    const range = new vscode.Range(firstHit.line, 0, lastHit.line + 1, 0);

    const action = new vscode.CodeAction(
      "Source: Organizar Imports",
      vscode.CodeActionKind.SourceOrganizeImports,
    );
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, range, rewritten);
    action.edit = edit;
    actions.push(action);
  }

  /**
   * `source.fixAll.data7` — applies every QuickFix that has an `.edit` (missing-import,
   * unused-import, duplicate-import, did-you-mean) in a single atomic
   * `WorkspaceEdit`. Skips command-only actions (install module dispatchers).
   */
  private addFixAllAction(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostics: readonly vscode.Diagnostic[],
  ): void {
    if (diagnostics.length === 0) return;
    const collected: vscode.CodeAction[] = [];

    for (const d of diagnostics) {
      switch (d.code) {
        case DiagnosticCodes.MissingImport:
          this.addMissingImportFix(collected, document, d);
          break;
        case DiagnosticCodes.UnusedImport:
        case DiagnosticCodes.DuplicateImport:
          this.addRemoveImportFix(collected, document, d);
          break;
        default:
          break;
      }
    }
    if (collected.length === 0) return;

    const merged = new vscode.WorkspaceEdit();
    let count = 0;
    for (const a of collected) {
      if (!a.edit) continue;
      for (const e of (
        a.edit as unknown as {
          edits: {
            type: string;
            uri: vscode.Uri;
            position?: vscode.Position;
            range?: vscode.Range;
            text?: string;
          }[];
        }
      ).edits) {
        if (e.type === "insert" && e.position && e.text !== undefined) {
          merged.insert(e.uri, e.position, e.text);
        } else if (e.type === "replace" && e.range && e.text !== undefined) {
          merged.replace(e.uri, e.range, e.text);
        } else if (e.type === "delete" && e.range) {
          merged.delete(e.uri, e.range);
        }
        count++;
      }
    }
    if (count === 0) return;

    const action = new vscode.CodeAction(
      `Source: Corrigir todos (${count} edição${count === 1 ? "" : "ões"})`,
      vscode.CodeActionKind.SourceFixAll.append("data7"),
    );
    action.edit = merged;
    actions.push(action);
  }

  // -------------------------------------------------------------------------
  // Per-code fix builders
  // -------------------------------------------------------------------------

  private addMissingImportFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<MissingImportPayload>(
      diagnostic,
      DiagnosticCodes.MissingImport,
    );
    const namespaceToImport = payload?.namespace ?? extractNamespaceFromMessage(diagnostic.message);
    if (!namespaceToImport) return;

    const action = new vscode.CodeAction(
      `Importar "${namespaceToImport}"`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    const insertLine = findImportInsertLine(document);
    edit.insert(
      document.uri,
      new vscode.Position(insertLine, 0),
      `Imports ${namespaceToImport}\r\n`,
    );
    action.edit = edit;
    actions.push(action);
  }

  private addRemoveImportFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<UnusedImportPayload>(
      diagnostic,
      DiagnosticCodes.UnusedImport,
    );
    const namespaceToRemove = payload?.namespace;
    const label = namespaceToRemove
      ? `Remover Imports "${namespaceToRemove}"`
      : "Remover esta linha";

    const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    const line = diagnostic.range.start.line;
    // Delete the whole line including the trailing newline so we don't leave a blank.
    const start = new vscode.Position(line, 0);
    const end =
      line + 1 < document.lineCount
        ? new vscode.Position(line + 1, 0)
        : document.lineAt(line).range.end;
    edit.delete(document.uri, new vscode.Range(start, end));
    action.edit = edit;
    actions.push(action);
  }

  private addDeclareDependencyFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<ModuleNotDeclaredPayload>(
      diagnostic,
      DiagnosticCodes.ModuleNotDeclared,
    );
    if (!payload) return;

    const action = new vscode.CodeAction(
      `Instalar e declarar módulo "${payload.moduleName}"`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = true;
    action.command = {
      title: action.title,
      command: "data7.installModule",
      arguments: [payload.moduleName, document.uri],
    };
    actions.push(action);
  }

  private addInstallModuleFix(actions: vscode.CodeAction[], diagnostic: vscode.Diagnostic): void {
    const payload = readDiagnosticPayload<ModuleNotFoundPayload>(
      diagnostic,
      DiagnosticCodes.ModuleNotFound,
    );
    if (!payload) return;

    const action = new vscode.CodeAction(
      `Instalar módulo "${payload.moduleName}" do repositório…`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.command = {
      title: action.title,
      command: "data7.installModule",
      arguments: [payload.moduleName],
    };
    actions.push(action);
  }

  private addDidYouMeanFixes(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<UnknownMemberPayload>(
      diagnostic,
      DiagnosticCodes.UnknownMember,
    );
    if (!payload || payload.suggestions.length === 0) return;

    payload.suggestions.forEach((suggestion, idx) => {
      const action = new vscode.CodeAction(
        `Você quis dizer "${suggestion}"?`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      if (idx === 0) action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, diagnostic.range, suggestion);
      action.edit = edit;
      actions.push(action);
    });
  }

  /**
   * Offers two Quick Fixes when the linter flags an `unsupported-member`:
   *
   *  1. **Comentar esta linha** — prefixa a linha com `'` para que o compilador
   *     ignore o trecho e o autor possa revisitar depois.
   *  2. **Suprimir warning aqui** — insere `' data7:disable-line unsupported-member`
   *     ao final da mesma linha. Útil quando o uso é intencional (legado) e a
   *     equipe assumiu o risco.
   */
  private addUnsupportedMemberFixes(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<UnsupportedMemberPayload>(
      diagnostic,
      DiagnosticCodes.UnsupportedMember,
    );
    const memberLabel = payload ? ` "${payload.member}"` : "";

    const line = diagnostic.range.start.line;
    const lineText = document.lineAt(line).text;

    // 1. Comentar a linha (prefixa com `' `).
    const commentAction = new vscode.CodeAction(
      `Comentar linha (membro não suportado${memberLabel})`,
      vscode.CodeActionKind.QuickFix,
    );
    commentAction.diagnostics = [diagnostic];
    commentAction.isPreferred = true;
    {
      const indentMatch = /^(\s*)/.exec(lineText);
      const indent = indentMatch?.[1] ?? "";
      const rest = lineText.slice(indent.length);
      const edit = new vscode.WorkspaceEdit();
      const range = new vscode.Range(line, 0, line, lineText.length);
      edit.replace(document.uri, range, `${indent}' ${rest}`);
      commentAction.edit = edit;
    }
    actions.push(commentAction);

    // 2. Inserir supressão `' data7:disable-line unsupported-member` no fim.
    const suppressAction = new vscode.CodeAction(
      `Suprimir warning unsupported-member nesta linha`,
      vscode.CodeActionKind.QuickFix,
    );
    suppressAction.diagnostics = [diagnostic];
    {
      const insertPos = new vscode.Position(line, lineText.length);
      const trailing = lineText.endsWith(" ") ? "" : " ";
      const edit = new vscode.WorkspaceEdit();
      edit.insert(document.uri, insertPos, `${trailing}' data7:disable-line unsupported-member`);
      suppressAction.edit = edit;
    }
    actions.push(suppressAction);
  }

  private addDeclarationParenthesesMismatchFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const action = new vscode.CodeAction(
      "Adicionar parênteses '()'",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, findDeclarationParenthesesInsertPosition(document, diagnostic), "()");
    action.edit = edit;
    actions.push(action);
  }

  private addUnknownTypeDidYouMeanFixes(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<UnknownTypePayload>(
      diagnostic,
      DiagnosticCodes.UnknownType,
    );
    if (!payload || payload.suggestions.length === 0) return;

    payload.suggestions.forEach((suggestion, idx) => {
      const action = new vscode.CodeAction(
        `Você quis dizer "${suggestion}"?`,
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      if (idx === 0) action.isPreferred = true;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, diagnostic.range, suggestion);
      action.edit = edit;
      actions.push(action);
    });
  }

  private addDeclarationParenthesesMismatchBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter(
      (d) => d.code === DiagnosticCodes.DeclarationParenthesesMismatch,
    );
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Adicionar parênteses '()' em todas as declarações deste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    for (const match of mismatches) {
      edit.insert(document.uri, findDeclarationParenthesesInsertPosition(document, match), "()");
    }
    action.edit = edit;
    actions.push(action);
  }

  private addMissingMyBaseNewFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const action = new vscode.CodeAction(
      "Adicionar chamada 'MyBase.New()'",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    // Sub New header is on diagnostic.range.start.line
    const line = diagnostic.range.start.line;
    const lineText = document.lineAt(line).text;
    const indentMatch = /^(\s*)/.exec(lineText);
    const indent = indentMatch?.[1] ?? "";
    // Insert on the next line inside the Sub
    const position = new vscode.Position(line + 1, 0);
    const insertText = `${indent}  MyBase.New()\n`;
    edit.insert(document.uri, position, insertText);
    action.edit = edit;
    actions.push(action);
  }

  private addMissingMyBaseNewBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.MissingMyBaseNew);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Adicionar chamada 'MyBase.New()' em todos os construtores deste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    // To avoid offset problems when modifying lines from top to bottom,
    // we can sort the diagnostics in descending order of line number.
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
    for (const match of sorted) {
      const line = match.range.start.line;
      const lineText = document.lineAt(line).text;
      const indentMatch = /^(\s*)/.exec(lineText);
      const indent = indentMatch?.[1] ?? "";
      const position = new vscode.Position(line + 1, 0);
      const insertText = `${indent}  MyBase.New()\n`;
      edit.insert(document.uri, position, insertText);
    }
    action.edit = edit;
    actions.push(action);
  }

  private addMissingMyBaseFreeFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<MissingMyBaseFreePayload>(
      diagnostic,
      DiagnosticCodes.MissingMyBaseFree,
    );
    if (!payload) return;

    // Check if the warning is on "Class" declaration (Sub Free is missing entirely)
    // or on "Sub Free" itself (MyBase.Free() call is missing).
    const lineText = document.lineAt(diagnostic.range.start.line).text;
    const isClassDecl = /\bClass\b/i.test(lineText);

    if (isClassDecl) {
      const action = new vscode.CodeAction(
        "Gerar método 'Sub Free()'",
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      const edit = new vscode.WorkspaceEdit();
      // Find where "End Class" is. We can search from the Class start line forward.
      let endClassLine = -1;
      const classIndentMatch = /^(\s*)/.exec(lineText);
      const classIndent = classIndentMatch?.[1] ?? "";

      for (let i = diagnostic.range.start.line + 1; i < document.lineCount; i++) {
        if (/^\s*End\s+Class\b/i.test(document.lineAt(i).text)) {
          endClassLine = i;
          break;
        }
      }

      if (endClassLine !== -1) {
        const position = new vscode.Position(endClassLine, 0);
        // Build Sub Free using the class's indentation
        const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
        const subFreeText = `${classIndent}  Public Sub Free()${eol}${classIndent}    MyBase.Free()${eol}${classIndent}  End Sub${eol}${eol}`;
        edit.insert(document.uri, position, subFreeText);
      }
      action.edit = edit;
      actions.push(action);
    } else {
      // Sub Free exists but lacks MyBase.Free() call
      const action = new vscode.CodeAction(
        "Adicionar chamada 'MyBase.Free()'",
        vscode.CodeActionKind.QuickFix,
      );
      action.diagnostics = [diagnostic];
      action.isPreferred = true;

      const edit = new vscode.WorkspaceEdit();
      const line = diagnostic.range.start.line;
      const indentMatch = /^(\s*)/.exec(lineText);
      const indent = indentMatch?.[1] ?? "";
      const position = new vscode.Position(line + 1, 0);
      const insertText = `${indent}  MyBase.Free()\n`;
      edit.insert(document.uri, position, insertText);
      action.edit = edit;
      actions.push(action);
    }
  }

  private addMissingMyBaseFreeBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.MissingMyBaseFree);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Corrigir/Gerar chamadas de 'MyBase.Free()' em todas as classes deste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    // Sort in descending order of start line to avoid offset shift issues
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

    for (const match of sorted) {
      const line = match.range.start.line;
      const lineText = document.lineAt(line).text;
      const isClassDecl = /\bClass\b/i.test(lineText);

      if (isClassDecl) {
        let endClassLine = -1;
        const classIndentMatch = /^(\s*)/.exec(lineText);
        const classIndent = classIndentMatch?.[1] ?? "";

        for (let i = line + 1; i < document.lineCount; i++) {
          if (/^\s*End\s+Class\b/i.test(document.lineAt(i).text)) {
            endClassLine = i;
            break;
          }
        }

        if (endClassLine !== -1) {
          const position = new vscode.Position(endClassLine, 0);
          const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
          const subFreeText = `${classIndent}  Public Sub Free()${eol}${classIndent}    MyBase.Free()${eol}${classIndent}  End Sub${eol}${eol}`;
          edit.insert(document.uri, position, subFreeText);
        }
      } else {
        const indentMatch = /^(\s*)/.exec(lineText);
        const indent = indentMatch?.[1] ?? "";
        const position = new vscode.Position(line + 1, 0);
        const insertText = `${indent}  MyBase.Free()\n`;
        edit.insert(document.uri, position, insertText);
      }
    }

    action.edit = edit;
    actions.push(action);
  }

  private addMissingThenFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const action = new vscode.CodeAction("Adicionar 'Then'", vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, findMissingThenInsertPosition(document, diagnostic), " Then");
    action.edit = edit;
    actions.push(action);
  }

  private addMissingThenBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const missingThen = dedupeDiagnostics([
      diagnostic,
      ...allDiags.filter(isMissingThenDiagnostic),
    ]);
    if (missingThen.length <= 1) return;

    const action = new vscode.CodeAction(
      "Adicionar 'Then' em todas as ocorrências deste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    for (const match of missingThen) {
      edit.insert(document.uri, findMissingThenInsertPosition(document, match), " Then");
    }
    action.edit = edit;
    actions.push(action);
  }

  private addLineSuppressionFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    code: string,
  ): void {
    const line = diagnostic.range.start.line;
    const lineText = document.lineAt(line).text;
    const action = new vscode.CodeAction(
      `Desabilitar erro "${code}" nesta linha`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const insertPos = new vscode.Position(line, lineText.length);
    const trailing = lineText.endsWith(" ") ? "" : " ";
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, insertPos, `${trailing}' data7:disable-line ${code}`);
    action.edit = edit;
    actions.push(action);
  }

  private addFileSuppressionFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    code: string,
  ): void {
    const action = new vscode.CodeAction(
      `Desabilitar erro "${code}" no arquivo inteiro`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
    edit.insert(document.uri, new vscode.Position(0, 0), `' data7:disable ${code}${eol}`);
    action.edit = edit;
    actions.push(action);
  }

  private addFinallyBlockUnsupportedFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const payload = readDiagnosticPayload<FinallyBlockUnsupportedPayload>(
      diagnostic,
      DiagnosticCodes.FinallyBlockUnsupported,
    );
    if (!payload) return;

    const { catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName } = payload;

    const varName = catchVarName ?? "_ex";
    const label = catchVarName
      ? `Encapsular bloco Catch com 'If Assigned(${varName}) Then'`
      : `Declarar variável de exceção e encapsular bloco Catch`;

    const action = new vscode.CodeAction(label, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.isPreferred = true;

    const edit = new vscode.WorkspaceEdit();

    if (!catchVarName) {
      const catchLineText = document.lineAt(catchLine).text;
      const catchRegex = /\bCatch\b/i;
      const newCatchLineText = catchLineText.replace(catchRegex, `Catch ${varName} As Exception`);
      edit.replace(
        document.uri,
        new vscode.Range(catchLine, 0, catchLine, catchLineText.length),
        newCatchLineText,
      );
    }

    const firstStmtLineText = document.lineAt(catchBodyStartLine).text;
    const indentMatch = /^(\s*)/.exec(firstStmtLineText);
    const bodyIndent = indentMatch?.[1] ?? "";

    const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
    const wrappedLines: string[] = [];
    wrappedLines.push(`${bodyIndent}If Assigned(${varName}) Then`);

    for (let i = catchBodyStartLine; i <= catchBodyEndLine; i++) {
      const lineText = document.lineAt(i).text;
      if (lineText.trim() === "") {
        wrappedLines.push("");
      } else {
        wrappedLines.push(`${bodyIndent}  ${lineText.trimStart()}`);
      }
    }

    wrappedLines.push(`${bodyIndent}End If`);
    const replacementText = wrappedLines.join(eol);

    const startPos = new vscode.Position(catchBodyStartLine, 0);
    const endPos = document.lineAt(catchBodyEndLine).range.end;
    edit.replace(document.uri, new vscode.Range(startPos, endPos), replacementText);

    action.edit = edit;
    actions.push(action);
  }

  private addFinallyBlockUnsupportedBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.FinallyBlockUnsupported);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Encapsular todos os blocos Catch com 'If Assigned' neste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();

    // Sort in descending order of start line to avoid offset shift issues
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

    for (const match of sorted) {
      const payload = readDiagnosticPayload<FinallyBlockUnsupportedPayload>(
        match,
        DiagnosticCodes.FinallyBlockUnsupported,
      );
      if (!payload) continue;

      const { catchLine, catchBodyStartLine, catchBodyEndLine, catchVarName } = payload;
      const varName = catchVarName ?? "_ex";

      if (!catchVarName) {
        const catchLineText = document.lineAt(catchLine).text;
        const catchRegex = /\bCatch\b/i;
        const newCatchLineText = catchLineText.replace(catchRegex, `Catch ${varName} As Exception`);
        edit.replace(
          document.uri,
          new vscode.Range(catchLine, 0, catchLine, catchLineText.length),
          newCatchLineText,
        );
      }

      const firstStmtLineText = document.lineAt(catchBodyStartLine).text;
      const indentMatch = /^(\s*)/.exec(firstStmtLineText);
      const bodyIndent = indentMatch?.[1] ?? "";

      const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
      const wrappedLines: string[] = [];
      wrappedLines.push(`${bodyIndent}If Assigned(${varName}) Then`);

      for (let i = catchBodyStartLine; i <= catchBodyEndLine; i++) {
        const lineText = document.lineAt(i).text;
        if (lineText.trim() === "") {
          wrappedLines.push("");
        } else {
          wrappedLines.push(`${bodyIndent}  ${lineText.trimStart()}`);
        }
      }

      wrappedLines.push(`${bodyIndent}End If`);
      const replacementText = wrappedLines.join(eol);

      const startPos = new vscode.Position(catchBodyStartLine, 0);
      const endPos = document.lineAt(catchBodyEndLine).range.end;
      edit.replace(document.uri, new vscode.Range(startPos, endPos), replacementText);
    }

    action.edit = edit;
    actions.push(action);
  }

  private addMissingImportBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.MissingImport);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Importar todas as dependências em falta neste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const namespacesToImport = new Set<string>();
    for (const match of mismatches) {
      const payload = readDiagnosticPayload<MissingImportPayload>(
        match,
        DiagnosticCodes.MissingImport,
      );
      const ns = payload?.namespace ?? extractNamespaceFromMessage(match.message);
      if (ns) {
        namespacesToImport.add(ns);
      }
    }

    if (namespacesToImport.size === 0) return;

    const edit = new vscode.WorkspaceEdit();
    const sorted = Array.from(namespacesToImport).sort();
    const insertLine = findImportInsertLine(document);

    const eol = (document.eol as unknown) === 1 ? "\n" : "\r\n";
    const insertionText = sorted.map((ns) => `Imports ${ns}`).join(eol) + eol;

    edit.insert(document.uri, new vscode.Position(insertLine, 0), insertionText);
    action.edit = edit;
    actions.push(action);
  }

  private addRemoveImportBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter(
      (d) => d.code === DiagnosticCodes.UnusedImport || d.code === DiagnosticCodes.DuplicateImport,
    );
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Remover todos os imports duplicados/não utilizados neste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

    for (const match of sorted) {
      const line = match.range.start.line;
      const start = new vscode.Position(line, 0);
      const end =
        line + 1 < document.lineCount
          ? new vscode.Position(line + 1, 0)
          : document.lineAt(line).range.end;
      edit.delete(document.uri, new vscode.Range(start, end));
    }

    action.edit = edit;
    actions.push(action);
  }

  private addDeclareDependencyBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.ModuleNotDeclared);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Declarar todos os módulos não declarados em data7.json",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const moduleNames = new Set<string>();
    for (const match of mismatches) {
      const payload = readDiagnosticPayload<ModuleNotDeclaredPayload>(
        match,
        DiagnosticCodes.ModuleNotDeclared,
      );
      if (payload?.moduleName) {
        moduleNames.add(payload.moduleName);
      }
    }

    if (moduleNames.size === 0) return;

    action.command = {
      title: action.title,
      command: "data7.installModulesBulk",
      arguments: [Array.from(moduleNames)],
    };
    actions.push(action);
  }

  private addInstallModuleBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.ModuleNotFound);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Instalar todos os módulos não encontrados a partir do repositório",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const moduleNames = new Set<string>();
    for (const match of mismatches) {
      const payload = readDiagnosticPayload<ModuleNotFoundPayload>(
        match,
        DiagnosticCodes.ModuleNotFound,
      );
      if (payload?.moduleName) {
        moduleNames.add(payload.moduleName);
      }
    }

    if (moduleNames.size === 0) return;

    action.command = {
      title: action.title,
      command: "data7.installModulesBulk",
      arguments: [Array.from(moduleNames)],
    };
    actions.push(action);
  }

  private addDidYouMeanBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.UnknownMember);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Corrigir todos os membros desconhecidos neste arquivo com a primeira sugestão",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

    let appliedCount = 0;
    for (const match of sorted) {
      const payload = readDiagnosticPayload<UnknownMemberPayload>(
        match,
        DiagnosticCodes.UnknownMember,
      );
      if (payload && payload.suggestions.length > 0) {
        edit.replace(document.uri, match.range, payload.suggestions[0]!);
        appliedCount++;
      }
    }

    if (appliedCount === 0) return;

    action.edit = edit;
    actions.push(action);
  }

  private addUnknownTypeDidYouMeanBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.UnknownType);
    if (mismatches.length <= 1) return;

    const action = new vscode.CodeAction(
      "Corrigir todos os tipos desconhecidos neste arquivo com a primeira sugestão",
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];

    const edit = new vscode.WorkspaceEdit();
    const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);

    let appliedCount = 0;
    for (const match of sorted) {
      const payload = readDiagnosticPayload<UnknownTypePayload>(match, DiagnosticCodes.UnknownType);
      if (payload && payload.suggestions.length > 0) {
        edit.replace(document.uri, match.range, payload.suggestions[0]!);
        appliedCount++;
      }
    }

    if (appliedCount === 0) return;

    action.edit = edit;
    actions.push(action);
  }

  private addUnsupportedMemberBulkFix(
    actions: vscode.CodeAction[],
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
  ): void {
    const allDiags = vscode.languages.getDiagnostics(document.uri);
    const mismatches = allDiags.filter((d) => d.code === DiagnosticCodes.UnsupportedMember);
    if (mismatches.length <= 1) return;

    // 1. Bulk comment action
    const commentAction = new vscode.CodeAction(
      "Comentar todas as linhas de membros não suportados neste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    commentAction.diagnostics = [diagnostic];
    {
      const edit = new vscode.WorkspaceEdit();
      const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
      for (const match of sorted) {
        const line = match.range.start.line;
        const lineText = document.lineAt(line).text;
        const indentMatch = /^(\s*)/.exec(lineText);
        const indent = indentMatch?.[1] ?? "";
        const rest = lineText.slice(indent.length);
        const range = new vscode.Range(line, 0, line, lineText.length);
        edit.replace(document.uri, range, `${indent}' ${rest}`);
      }
      commentAction.edit = edit;
      actions.push(commentAction);
    }

    // 2. Bulk suppression action
    const suppressAction = new vscode.CodeAction(
      "Suprimir avisos de membros não suportados em todas as ocorrências deste arquivo",
      vscode.CodeActionKind.QuickFix,
    );
    suppressAction.diagnostics = [diagnostic];
    {
      const edit = new vscode.WorkspaceEdit();
      const sorted = [...mismatches].sort((a, b) => b.range.start.line - a.range.start.line);
      for (const match of sorted) {
        const line = match.range.start.line;
        const lineText = document.lineAt(line).text;
        const insertPos = new vscode.Position(line, lineText.length);
        const trailing = lineText.endsWith(" ") ? "" : " ";
        edit.insert(document.uri, insertPos, `${trailing}' data7:disable-line unsupported-member`);
      }
      suppressAction.edit = edit;
      actions.push(suppressAction);
    }
  }
}
