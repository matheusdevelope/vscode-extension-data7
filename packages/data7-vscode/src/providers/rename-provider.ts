import * as fs from "fs";
import * as vscode from "vscode";
import { LanguageProcessor, WorkspaceSymbolIndexer } from "@data7/core";
import type { SymbolInfo } from "@data7/core";

const VALID_NEW_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Implements `F2` Rename for Data7 Basic.
 * Uses tokens from LanguageProcessor for safe, precise renaming.
 */
export class D7BasicRenameProvider implements vscode.RenameProvider {
  private indexer = WorkspaceSymbolIndexer.getInstance();

  public prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Range | { range: vscode.Range; placeholder: string }> {
    if (token.isCancellationRequested) return undefined;
    const range = document.getWordRangeAtPosition(position);
    if (!range) throw new Error("Cursor não está sobre um identificador renomeável.");

    const word = document.getText(range);

    // Obter o contexto do nome qualificado completo sob o cursor
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const qNameCtx = resolveQualifiedNameAtPosition(
      cached.tokens,
      position.line,
      position.character,
    );

    let symbol: SymbolInfo | undefined;
    if (qNameCtx) {
      const rootNs = qNameCtx.parts[0];
      if (rootNs) {
        const rootSymbol = this.indexer
          .getAllSymbols()
          .find((s) => s.kind === "namespace" && s.name.toLowerCase() === rootNs.toLowerCase());
        if (rootSymbol) {
          const remainder = qNameCtx.parts.slice(1, qNameCtx.targetPartIndex + 1);
          const targetNamespaceFull = [rootSymbol.name, ...remainder].join(".");
          symbol = {
            name: targetNamespaceFull,
            kind: "namespace",
            type: "Namespace",
            isShared: true,
            isPrivate: false,
            range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
            fileUri: document.uri.toString(),
          };
        }
      }
    }

    symbol ??= this.findRenameableSymbol(word);

    if (!symbol) {
      throw new Error(
        `O símbolo "${word}" não é renomeável (apenas classes, métodos, namespaces e structures do workspace podem ser renomeados).`,
      );
    }
    return { range, placeholder: word };
  }

  public provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.WorkspaceEdit> {
    if (token.isCancellationRequested) return undefined;

    if (!VALID_NEW_NAME_RE.test(newName)) {
      throw new Error(
        "O novo nome deve começar com letra ou underscore e conter apenas letras, dígitos e underscores.",
      );
    }

    const range = document.getWordRangeAtPosition(position);
    if (!range) return undefined;
    const oldName = document.getText(range);
    if (oldName === newName) return new vscode.WorkspaceEdit();

    // Obter o contexto do nome qualificado completo sob o cursor
    const cached = LanguageProcessor.getInstance().getOrParse(
      document.uri.toString(),
      document.getText(),
    );
    const qNameCtx = resolveQualifiedNameAtPosition(
      cached.tokens,
      position.line,
      position.character,
    );

    let symbol: SymbolInfo | undefined;
    let targetNamespaceFull: string | undefined;

    if (qNameCtx) {
      const rootNs = qNameCtx.parts[0];
      if (rootNs) {
        const rootSymbol = this.indexer
          .getAllSymbols()
          .find((s) => s.kind === "namespace" && s.name.toLowerCase() === rootNs.toLowerCase());
        if (rootSymbol) {
          const remainder = qNameCtx.parts.slice(1, qNameCtx.targetPartIndex + 1);
          targetNamespaceFull = [rootSymbol.name, ...remainder].join(".");
          symbol = {
            name: targetNamespaceFull,
            kind: "namespace",
            type: "Namespace",
            isShared: true,
            isPrivate: false,
            range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
            fileUri: document.uri.toString(),
          };
        }
      }
    }

    symbol ??= this.findRenameableSymbol(oldName);

    if (!symbol) return undefined;

    const edit = new vscode.WorkspaceEdit();

    if (symbol.kind === "namespace" && targetNamespaceFull) {
      const targetPartIndex = qNameCtx ? qNameCtx.targetPartIndex : 0;

      rewriteNamespaceDocument(
        edit,
        this.indexer,
        document.uri,
        document.getText(),
        targetNamespaceFull,
        targetPartIndex,
        newName,
      );

      for (const fileSyms of this.indexer.getAllFileSymbols()) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (token.isCancellationRequested) return undefined;
        if (fileSyms.fileUri === document.uri.toString()) continue;
        try {
          const text = readFileTextSafely(fileSyms.filePath);
          rewriteNamespaceDocument(
            edit,
            this.indexer,
            vscode.Uri.parse(fileSyms.fileUri),
            text,
            targetNamespaceFull,
            targetPartIndex,
            newName,
          );
        } catch {
          // skip
        }
      }
    } else {
      rewriteDocument(
        edit,
        this.indexer,
        document.uri,
        document.getText(),
        oldName,
        newName,
        symbol.kind,
      );

      for (const fileSyms of this.indexer.getAllFileSymbols()) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (token.isCancellationRequested) return undefined;
        if (fileSyms.fileUri === document.uri.toString()) continue;
        try {
          const text = readFileTextSafely(fileSyms.filePath);
          rewriteDocument(
            edit,
            this.indexer,
            vscode.Uri.parse(fileSyms.fileUri),
            text,
            oldName,
            newName,
            symbol.kind,
          );
        } catch {
          // skip
        }
      }
    }

    return edit;
  }

  private findRenameableSymbol(name: string): SymbolInfo | undefined {
    const lowerName = name.toLowerCase();
    const allowedKinds: readonly SymbolInfo["kind"][] = [
      "class",
      "structure",
      "namespace",
      "method",
      "delegate",
      "declare_sub",
      "declare_function",
    ];
    return this.indexer
      .getAllSymbols()
      .find((s) => s.name.toLowerCase() === lowerName && allowedKinds.includes(s.kind));
  }
}

interface QualifiedNameContext {
  fullName: string;
  parts: string[];
  targetPartIndex: number;
}

function resolveQualifiedNameAtPosition(
  tokens: readonly { kind: string; value: string; loc: { line: number; column: number } }[],
  line: number,
  column: number,
): QualifiedNameContext | undefined {
  const targetTokenIndex = tokens.findIndex((t) => {
    const tLine = t.loc.line - 1;
    return tLine === line && column >= t.loc.column && column < t.loc.column + t.value.length;
  });

  if (targetTokenIndex === -1) return undefined;
  return resolveQualifiedNameAtTokenIndex(tokens, targetTokenIndex);
}

function resolveQualifiedNameAtTokenIndex(
  tokens: readonly { kind: string; value: string; loc: { line: number; column: number } }[],
  tokenIndex: number,
): QualifiedNameContext | undefined {
  const targetToken = tokens[tokenIndex];
  if (targetToken?.kind !== "identifier") return undefined;

  const parts: string[] = [targetToken.value];
  let targetPartIndex = 0;

  // Caminhar para trás
  let i = tokenIndex;
  while (i >= 2) {
    const prev1 = tokens[i - 1];
    const prev2 = tokens[i - 2];
    if (prev1 && prev2 && prev1.value === "." && prev2.kind === "identifier") {
      parts.unshift(prev2.value);
      targetPartIndex++;
      i -= 2;
    } else {
      break;
    }
  }

  // Caminhar para frente
  i = tokenIndex;
  while (i + 2 < tokens.length) {
    const next1 = tokens[i + 1];
    const next2 = tokens[i + 2];
    if (next1 && next2 && next1.value === "." && next2.kind === "identifier") {
      parts.push(next2.value);
      i += 2;
    } else {
      break;
    }
  }

  return {
    fullName: parts.join("."),
    parts,
    targetPartIndex,
  };
}

function rewriteNamespaceDocument(
  edit: vscode.WorkspaceEdit,
  indexer: WorkspaceSymbolIndexer,
  uri: vscode.Uri,
  fullText: string,
  targetNamespaceFull: string,
  targetPartIndex: number,
  newName: string,
): void {
  const cached = LanguageProcessor.getInstance().getOrParse(uri.toString(), fullText);
  const tokens = cached.tokens;

  const targetNamespaceFullLower = targetNamespaceFull.toLowerCase();
  const targetNamespaceParts = targetNamespaceFull.split(".");
  const partOriginalName = targetNamespaceParts[targetPartIndex];
  if (!partOriginalName) return;
  const partOriginalNameLower = partOriginalName.toLowerCase();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== "identifier" || t.value.toLowerCase() !== partOriginalNameLower) {
      continue;
    }

    const qCtx = resolveQualifiedNameAtTokenIndex(tokens, i);
    if (!qCtx) continue;

    const nsPrefixAtToken = qCtx.parts
      .slice(0, qCtx.targetPartIndex + 1)
      .join(".")
      .toLowerCase();

    if (nsPrefixAtToken === targetNamespaceFullLower && qCtx.targetPartIndex === targetPartIndex) {
      if (isValidNamespaceOccurrence(tokens, i, qCtx, nsPrefixAtToken, indexer)) {
        const line = Math.max(0, t.loc.line - 1);
        const start = new vscode.Position(line, t.loc.column);
        const end = new vscode.Position(line, t.loc.column + t.value.length);
        edit.replace(uri, new vscode.Range(start, end), newName);
      }
    }
  }
}

function isValidNamespaceOccurrence(
  tokens: readonly { kind: string; value: string }[],
  tokenIndex: number,
  qCtx: QualifiedNameContext,
  nsPrefixAtToken: string,
  indexer: WorkspaceSymbolIndexer,
): boolean {
  const pathStartTokenIndex = tokenIndex - qCtx.targetPartIndex * 2;

  // 1. Verificar se é precedido por "namespace" ou "imports"
  if (pathStartTokenIndex > 0) {
    const prevToken = tokens[pathStartTokenIndex - 1];
    if (prevToken) {
      const prevVal = prevToken.value.toLowerCase();
      if (prevVal === "namespace" || prevVal === "imports") {
        return true;
      }
    }
  }

  // 2. Verificar se o token é sucedido por "." e um identifier
  if (tokenIndex + 2 < tokens.length) {
    const next1 = tokens[tokenIndex + 1];
    const next2 = tokens[tokenIndex + 2];
    if (next1 && next2 && next1.value === "." && next2.kind === "identifier") {
      const nextId = next2.value.toLowerCase();

      const fullNsPath = `${nsPrefixAtToken}.${nextId}`.toLowerCase();
      const isKnownNamespace = indexer
        .getAllSymbols()
        .some((s) => s.kind === "namespace" && s.name.toLowerCase() === fullNsPath);
      if (isKnownNamespace) return true;

      const isContainedSymbol = indexer.getAllSymbols().some((s) => {
        if (s.name.toLowerCase() !== nextId) return false;
        if (!s.containerName) return false;
        const containerLower = s.containerName.toLowerCase();
        const prefixLower = nsPrefixAtToken.toLowerCase();
        return prefixLower === containerLower || prefixLower.startsWith(containerLower + ".");
      });
      if (isContainedSymbol) return true;
    }
  }

  return false;
}

function rewriteDocument(
  edit: vscode.WorkspaceEdit,
  indexer: WorkspaceSymbolIndexer,
  uri: vscode.Uri,
  fullText: string,
  oldName: string,
  newName: string,
  symbolKind: SymbolInfo["kind"],
): void {
  const cached = LanguageProcessor.getInstance().getOrParse(uri.toString(), fullText);
  const tokens = cached.tokens;
  const oldNameLower = oldName.toLowerCase();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind !== "identifier" || t.value.toLowerCase() !== oldNameLower) {
      continue;
    }

    let shouldRename = false;

    if (symbolKind === "namespace") {
      const prev1 = tokens[i - 1];
      const next1 = tokens[i + 1];
      const next2 = tokens[i + 2];

      // Regra A: Declaração de namespace (Namespace oldName)
      if (prev1?.value.toLowerCase() === "namespace") {
        shouldRename = true;
      }
      // Regra B: Diretiva Imports (Imports oldName)
      else if (prev1?.value.toLowerCase() === "imports") {
        shouldRename = true;
      }
      // Regra C: Prefixo qualificado (oldName.Classe)
      else if (next1?.value === "." && next2?.kind === "identifier") {
        const nextName = next2.value;
        const symbol = indexer
          .getAllSymbols()
          .find(
            (s) =>
              s.containerName?.toLowerCase() === oldNameLower &&
              s.name.toLowerCase() === nextName.toLowerCase(),
          );
        if (symbol) {
          shouldRename = true;
        }
      }
    } else if (symbolKind === "class" || symbolKind === "structure" || symbolKind === "delegate") {
      const prev1 = tokens[i - 1];
      const prev2 = tokens[i - 2];

      // Regra T1: Declaração (Class oldName, Structure oldName, Delegate Sub oldName)
      if (prev1 && ["class", "structure", "delegate"].includes(prev1.value.toLowerCase())) {
        shouldRename = true;
      } else if (
        prev1?.value.toLowerCase() === "sub" &&
        prev2?.value.toLowerCase() === "delegate"
      ) {
        shouldRename = true;
      } else if (
        prev1?.value.toLowerCase() === "function" &&
        prev2?.value.toLowerCase() === "delegate"
      ) {
        shouldRename = true;
      }
      // Regra T2: Declaração de tipo (As oldName, As New oldName)
      else if (prev1?.value.toLowerCase() === "as") {
        shouldRename = true;
      } else if (prev1?.value.toLowerCase() === "new" && prev2?.value.toLowerCase() === "as") {
        shouldRename = true;
      }
      // Regra T4: Herança (Inherits oldName)
      else if (prev1?.value.toLowerCase() === "inherits") {
        shouldRename = true;
      }
      // Regra T3: Qualificação qualificada (Namespace.oldName)
      else if (prev1?.value === "." && prev2?.kind === "identifier") {
        const nsName = prev2.value.toLowerCase();
        // Verifica se a classe oldName pertence ao namespace nsName no indexador
        const symbol = indexer
          .getAllSymbols()
          .find(
            (s) =>
              s.name.toLowerCase() === oldNameLower &&
              s.containerName?.toLowerCase() === nsName &&
              s.kind === symbolKind,
          );
        if (symbol) {
          shouldRename = true;
        }
      }
      // Regra T5: Instanciação (New oldName)
      else if (prev1?.value.toLowerCase() === "new") {
        shouldRename = true;
      }
    } else if (
      symbolKind === "method" ||
      symbolKind === "declare_sub" ||
      symbolKind === "declare_function"
    ) {
      const prev1 = tokens[i - 1];
      const next1 = tokens[i + 1];

      // Regra M1: Declaração (Sub oldName, Function oldName)
      if (prev1 && ["sub", "function"].includes(prev1.value.toLowerCase())) {
        shouldRename = true;
      }
      // Regra M2: Acesso/Invocação qualificada ou direta (oldName(args))
      else if (next1?.value === "(") {
        shouldRename = true;
      }
      // Regra M3: Atribuição de retorno dentro da função (oldName = valor)
      else if (next1?.value === "=") {
        shouldRename = true;
      }
    }

    if (shouldRename) {
      const line = Math.max(0, t.loc.line - 1);
      const start = new vscode.Position(line, t.loc.column);
      const end = new vscode.Position(line, t.loc.column + t.value.length);
      edit.replace(uri, new vscode.Range(start, end), newName);
    }
  }
}

function readFileTextSafely(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}
