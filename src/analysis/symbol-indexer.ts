import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { logger } from "../infra/logger";
import { IMPORTS_REGEX_ANCHORED } from "./dependency-scanner";
import { isExcluded } from "../infra/configuration";
import {
  collectGenericsContext,
  type GenericTemplateInfo,
  type GenericUsageOccurrence,
} from "./generics-analyzer";

// Parameter info
export interface ParameterInfo {
  name: string;
  type: string;
  isByRef: boolean;
  isOptional: boolean;
  defaultValue?: string;
}

// Symbol info
export interface SymbolInfo {
  name: string;
  /**
   * `indexed-property` é a forma Delphi de uma propriedade que aceita
   * argumentos (ex.: `Grid.Cells(ACol, ARow)` ou `Grid.ColWidth(ACol)`). É
   * tratada como property pelo resolvedor (sem invocação de método obrigatória)
   * mas o hover/SignatureHelp mostram a lista de parâmetros.
   */
  kind:
    | "namespace"
    | "class"
    | "structure"
    | "delegate"
    | "method"
    | "property"
    | "indexed-property"
    | "variable"
    | "declare_sub"
    | "declare_function";
  type: string;
  isShared: boolean;
  isPrivate: boolean;
  parameters?: ParameterInfo[];
  /**
   * Overloads adicionais do mesmo método/property indexada — quando preenchido,
   * `parameters` representa a assinatura primária (a primeira mostrada) e
   * `overloads` lista as alternativas. O SignatureHelpProvider exibe todas e
   * destaca a que corresponde ao número de argumentos no call site.
   */
  overloads?: ParameterInfo[][];
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  fileUri: string;
  containerName?: string; // e.g. NamespaceName or ClassName
  description?: string;
  inheritsFrom?: string;
  /**
   * Marca membros que aparecem no autocomplete da linguagem original mas que o
   * compilador Data7 não traduz. Usados pelo linter para emitir o diagnóstico
   * `unsupported-member` (ver `src/diagnostic-codes.ts`) e pelos providers de
   * completion/hover para exibirem o item como deprecated.
   */
  isUnsupported?: boolean;
  isGenericParam?: boolean;
  constraintName?: string;
}

export interface FileSymbols {
  fileUri: string;
  filePath: string;
  imports: string[];
  symbols: SymbolInfo[];
}

export class SymbolParser {
  public static parseParameters(paramsStr: string): ParameterInfo[] {
    const result: ParameterInfo[] = [];
    if (!paramsStr.trim()) {
      return result;
    }
    // Simple split by comma
    const parts = paramsStr.split(",");
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      let isByRef = false;
      let isOptional = false;
      let pText = trimmed;

      // Check ByVal / ByRef
      if (pText.toLowerCase().startsWith("byref ")) {
        isByRef = true;
        pText = pText.substring(6).trim();
      } else if (pText.toLowerCase().startsWith("byval ")) {
        pText = pText.substring(6).trim();
      }

      // Check Optional
      if (pText.toLowerCase().startsWith("optional ")) {
        isOptional = true;
        pText = pText.substring(9).trim();
      }

      let name = "";
      let type = "Variant";
      let defaultValue: string | undefined;

      const eqIdx = pText.indexOf("=");
      if (eqIdx !== -1) {
        defaultValue = pText.substring(eqIdx + 1).trim();
        pText = pText.substring(0, eqIdx).trim();
        isOptional = true;
      }

      const asIdx = pText.toLowerCase().lastIndexOf(" as ");
      if (asIdx !== -1) {
        name = pText.substring(0, asIdx).trim();
        type = pText.substring(asIdx + 4).trim();
      } else {
        name = pText;
      }

      result.push({
        name,
        type,
        isByRef,
        isOptional,
        defaultValue,
      });
    }
    return result;
  }

  public static parseBasFile(fileUri: string, content: string): FileSymbols {
    const lines = content.split(/\r?\n/);
    const fileSymbols: FileSymbols = {
      fileUri,
      filePath: vscode.Uri.parse(fileUri).fsPath,
      imports: [],
      symbols: [],
    };

    let activeNamespace: string | undefined;
    let activeClass: SymbolInfo | undefined;
    let activeStructure: SymbolInfo | undefined;
    let activeProperty: SymbolInfo | undefined;
    let activeMethod: SymbolInfo | undefined;

    let pendingDescription = "";

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      // `lineIdx < lines.length` makes `lines[lineIdx]` always defined; the
      // `?? ""` keeps `noUncheckedIndexedAccess` happy without weakening
      // anything at runtime.
      const line = lines[lineIdx] ?? "";
      const trimmed = line.trim();

      // 1. Check comments
      if (trimmed.startsWith("'") || trimmed.toLowerCase().startsWith("rem ")) {
        const commentContent = trimmed.startsWith("'")
          ? trimmed.substring(1)
          : trimmed.substring(4);
        const cleaned = commentContent.trim();
        if (!cleaned.startsWith("@")) {
          // skip metadata tags like @Module
          if (pendingDescription) {
            pendingDescription += "\n" + cleaned;
          } else {
            pendingDescription = cleaned;
          }
        }
        continue;
      }

      if (!trimmed) {
        pendingDescription = "";
        continue;
      }

      const lowerTrimmed = trimmed.toLowerCase();

      // 2. Imports
      const importMatch = trimmed.match(IMPORTS_REGEX_ANCHORED);
      if (importMatch?.[1]) {
        fileSymbols.imports.push(importMatch[1]);
        pendingDescription = "";
        continue;
      }

      // 3. Namespace end
      if (lowerTrimmed === "end namespace") {
        activeNamespace = undefined;
        pendingDescription = "";
        continue;
      }

      // 4. Namespace start
      const nsMatch = /^Namespace\s+([a-zA-Z0-9_.]+)/i.exec(trimmed);
      if (nsMatch?.[1]) {
        activeNamespace = nsMatch[1];
        const nsSymbol: SymbolInfo = {
          name: activeNamespace,
          kind: "namespace",
          type: "Namespace",
          isShared: true,
          isPrivate: false,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(activeNamespace),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          description: pendingDescription || `Namespace ${activeNamespace}`,
        };
        fileSymbols.symbols.push(nsSymbol);
        pendingDescription = "";
        continue;
      }

      // 5. End Class
      if (lowerTrimmed === "end class") {
        if (activeClass) {
          activeClass.range.endLine = lineIdx;
          activeClass.range.endChar = line.length;
        }
        activeClass = undefined;
        pendingDescription = "";
        continue;
      }

      // 6. Inherits (inside class)
      const inheritsMatch = /^Inherits\s+([a-zA-Z0-9_.]+)/i.exec(trimmed);
      if (inheritsMatch?.[1] && activeClass) {
        activeClass.inheritsFrom = inheritsMatch[1];
        pendingDescription = "";
        continue;
      }

      // 7. Class start
      const classMatch = /^(?:(Private|Public|Protected|Shared)\s+)*Class\s+([a-zA-Z0-9_]+)/i.exec(
        trimmed,
      );
      if (classMatch?.[2]) {
        const classIdx = trimmed.toLowerCase().indexOf("class");
        const modifiersPart = trimmed.substring(0, classIdx);
        const isPrivate = /\bprivate\b/i.test(modifiersPart);
        const isShared = /\bshared\b/i.test(modifiersPart);
        const name = classMatch[2];

        const classSymbol: SymbolInfo = {
          name,
          kind: "class",
          type: name,
          isShared,
          isPrivate,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(name),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          containerName: activeNamespace,
          description: pendingDescription || undefined,
        };
        fileSymbols.symbols.push(classSymbol);
        activeClass = classSymbol;
        pendingDescription = "";
        continue;
      }

      // 8. End Structure
      if (lowerTrimmed === "end structure") {
        if (activeStructure) {
          activeStructure.range.endLine = lineIdx;
          activeStructure.range.endChar = line.length;
        }
        activeStructure = undefined;
        pendingDescription = "";
        continue;
      }

      // 9. Structure start
      const structMatch =
        /^(?:(Private|Public|Protected|Shared)\s+)*Structure\s+([a-zA-Z0-9_]+)/i.exec(trimmed);
      if (structMatch?.[2]) {
        const structIdx = trimmed.toLowerCase().indexOf("structure");
        const modifiersPart = trimmed.substring(0, structIdx);
        const isPrivate = /\bprivate\b/i.test(modifiersPart);
        const isShared = /\bshared\b/i.test(modifiersPart);
        const name = structMatch[2];

        const structSymbol: SymbolInfo = {
          name,
          kind: "structure",
          type: name,
          isShared,
          isPrivate,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(name),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          containerName: activeClass?.name ?? activeNamespace,
          description: pendingDescription || undefined,
        };
        fileSymbols.symbols.push(structSymbol);
        activeStructure = structSymbol;
        pendingDescription = "";
        continue;
      }

      // 10. End Property
      if (lowerTrimmed === "end property") {
        if (activeProperty) {
          activeProperty.range.endLine = lineIdx;
          activeProperty.range.endChar = line.length;
        }
        activeProperty = undefined;
        pendingDescription = "";
        continue;
      }

      // 11. Property start
      const propMatch =
        /^(?:(Private|Public|Protected|Shared|ReadOnly|WriteOnly)\s+)*Property\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?(?:\s+As\s+([a-zA-Z0-9_.]+(?:\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?/i.exec(
          trimmed,
        );
      if (propMatch?.[2]) {
        const propIdx = trimmed.toLowerCase().indexOf("property");
        const modifiersPart = trimmed.substring(0, propIdx);
        const isPrivate = /\bprivate\b/i.test(modifiersPart);
        const isShared = /\bshared\b/i.test(modifiersPart);
        const name = propMatch[2];
        const hasParams = propMatch[3] !== undefined;
        const type = propMatch[4] ?? "Variant";

        const propSymbol: SymbolInfo = {
          name,
          kind: hasParams ? "indexed-property" : "property",
          type,
          isShared,
          isPrivate,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(name),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          containerName: activeClass?.name ?? activeNamespace,
          description: pendingDescription || undefined,
        };
        if (hasParams && propMatch[3]) {
          propSymbol.parameters = SymbolParser.parseParameters(propMatch[3]);
        }
        fileSymbols.symbols.push(propSymbol);
        activeProperty = propSymbol;
        pendingDescription = "";
        continue;
      }

      // 12. Delegate
      const delegateMatch =
        /^(?:(Private|Public|Protected|Shared)\s+)*Delegate\s+(Sub|Function)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s+As\s+([a-zA-Z0-9_.]+(?:\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?/i.exec(
          trimmed,
        );
      if (delegateMatch?.[3]) {
        const delegateIdx = trimmed.toLowerCase().indexOf("delegate");
        const modifiersPart = trimmed.substring(0, delegateIdx);
        const isPrivate = /\bprivate\b/i.test(modifiersPart);
        const isShared = /\bshared\b/i.test(modifiersPart);
        const name = delegateMatch[3];
        const params = this.parseParameters(delegateMatch[4] ?? "");
        const type =
          delegateMatch[5] ??
          ((delegateMatch[2] ?? "").toLowerCase() === "sub" ? "Void" : "Variant");

        const delegateSymbol: SymbolInfo = {
          name,
          kind: "delegate",
          type,
          isShared,
          isPrivate,
          parameters: params,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(name),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          containerName: activeClass?.name ?? activeNamespace,
          description: pendingDescription || undefined,
        };
        fileSymbols.symbols.push(delegateSymbol);
        pendingDescription = "";
        continue;
      }

      // 13. Declare Function / Sub
      const declareMatch =
        /^(?:(Private|Public|Protected|Shared)\s+)*Declare\s+(Sub|Function)\s+([a-zA-Z0-9_]+)\s+Lib\s+"([^"]+)"(?:\s+Alias\s+"([^"]+)")?\s*\(([^)]*)\)(?:\s+As\s+([a-zA-Z0-9_.]+(?:\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?/i.exec(
          trimmed,
        );
      if (declareMatch?.[3]) {
        const modifiers = declareMatch[1]?.toLowerCase() ?? "";
        const isPrivate = /\bprivate\b/i.test(modifiers);
        const isShared = true;
        const subOrFunc = (declareMatch[2] ?? "").toLowerCase();
        const kind = subOrFunc === "sub" ? "declare_sub" : "declare_function";
        const name = declareMatch[3];
        const params = this.parseParameters(declareMatch[6] ?? "");
        const type = declareMatch[7] ?? (subOrFunc === "sub" ? "Void" : "Variant");

        const declareSymbol: SymbolInfo = {
          name,
          kind,
          type,
          isShared,
          isPrivate,
          parameters: params,
          range: {
            startLine: lineIdx,
            startChar: line.indexOf(name),
            endLine: lineIdx,
            endChar: line.length,
          },
          fileUri,
          containerName: activeNamespace,
          description: pendingDescription || `Importação de API Win32 de ${declareMatch[4] ?? "?"}`,
        };
        fileSymbols.symbols.push(declareSymbol);
        pendingDescription = "";
        continue;
      }

      // 14. End Sub / Function
      if (lowerTrimmed === "end sub" || lowerTrimmed === "end function") {
        if (activeMethod) {
          activeMethod.range.endLine = lineIdx;
          activeMethod.range.endChar = line.length;
        }
        activeMethod = undefined;
        pendingDescription = "";
        continue;
      }

      // 15. Sub / Function start
      const methodMatch =
        /^(?:(Private|Public|Protected|Shared|Overridable|Overrides)\s+)*(Sub|Function)\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?(?:\s+As\s+([a-zA-Z0-9_.]+(?:\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?/i.exec(
          trimmed,
        );
      if (methodMatch?.[3]) {
        const subIdx = trimmed.toLowerCase().indexOf("sub");
        const funcIdx = trimmed.toLowerCase().indexOf("function");
        const keywordIdx =
          subIdx !== -1 && funcIdx !== -1
            ? Math.min(subIdx, funcIdx)
            : subIdx !== -1
              ? subIdx
              : funcIdx;
        const modifiersPart = trimmed.substring(0, keywordIdx);
        const isPrivate = /\bprivate\b/i.test(modifiersPart);
        const isShared = /\bshared\b/i.test(modifiersPart) || (!activeClass && !!activeNamespace);
        const name = methodMatch[3];
        const params = this.parseParameters(methodMatch[4] ?? "");
        const type =
          methodMatch[5] ?? ((methodMatch[2] ?? "").toLowerCase() === "sub" ? "Void" : "Variant");

        if (name.toLowerCase() !== "new" || activeClass) {
          const methodSymbol: SymbolInfo = {
            name,
            kind: "method",
            type,
            isShared,
            isPrivate,
            parameters: params,
            range: {
              startLine: lineIdx,
              startChar: line.indexOf(name),
              endLine: lineIdx,
              endChar: line.length,
            },
            fileUri,
            containerName: activeClass?.name ?? activeNamespace,
            description: pendingDescription || undefined,
          };
          fileSymbols.symbols.push(methodSymbol);
          activeMethod = methodSymbol;
        }
        pendingDescription = "";
        continue;
      }

      // 16. Fields / Variables (Dim)
      if (!activeMethod && !activeProperty) {
        const varMatch =
          /^(?:(Private|Public|Protected|Shared|ReadOnly|WriteOnly)\s+)*(?:Dim\s+)?([a-zA-Z0-9_]+)(?:\s+As\s+(?:New\s+)?([a-zA-Z0-9_.]+(?:\s*<[^<>]*?(?:<[^<>]*?>[^<>]*?)*?>)?))?/i.exec(
            trimmed,
          );
        if (varMatch?.[2] && (activeClass || activeStructure || activeNamespace)) {
          const name = varMatch[2];
          const lowerName = name.toLowerCase();
          const reserved = [
            "if",
            "else",
            "elseif",
            "select",
            "case",
            "for",
            "each",
            "do",
            "loop",
            "while",
            "until",
            "try",
            "catch",
            "finally",
            "end",
            "exit",
            "return",
            "next",
            "throw",
            "imports",
            "namespace",
            "class",
            "structure",
            "delegate",
            "property",
            "sub",
            "function",
            "declare",
            "shared",
            "private",
            "public",
            "protected",
            "inherits",
            "with",
          ];

          if (!reserved.includes(lowerName)) {
            const varName = varMatch[2];
            const varNameIdx = trimmed.indexOf(varName);
            const modifiersPart = trimmed.substring(0, varNameIdx);
            const isPrivate = /\bprivate\b/i.test(modifiersPart);
            const isShared =
              /\bshared\b/i.test(modifiersPart) || (!activeClass && !!activeNamespace);
            const type = varMatch[3] ?? "Variant";

            const varSymbol: SymbolInfo = {
              name,
              kind: "variable",
              type,
              isShared,
              isPrivate,
              range: {
                startLine: lineIdx,
                startChar: line.indexOf(name),
                endLine: lineIdx,
                endChar: line.length,
              },
              fileUri,
              containerName: activeClass?.name ?? activeStructure?.name ?? activeNamespace,
              description: pendingDescription || undefined,
            };
            fileSymbols.symbols.push(varSymbol);
          }
        }
      }

      pendingDescription = "";
    }

    return fileSymbols;
  }
}

export class WorkspaceSymbolIndexer {
  private static instance: WorkspaceSymbolIndexer | undefined;
  private cache = new Map<string, FileSymbols>(); // fileUri -> FileSymbols

  // Singleton — the private constructor prevents instantiation outside `getInstance`.
  private constructor() {
    /* intentional: enforces singleton */
  }

  public static getInstance(): WorkspaceSymbolIndexer {
    WorkspaceSymbolIndexer.instance ??= new WorkspaceSymbolIndexer();
    return WorkspaceSymbolIndexer.instance;
  }

  /**
   * Creates a brand-new indexer instance that does NOT share state with the
   * extension-host singleton. Intended for build-time / CLI flows that need
   * a deterministic, isolated view of a project (no leakage from previously
   * opened workspaces, no mutation that survives the build).
   *
   * Production callers should still prefer {@link getInstance} so that the
   * indexing cache is reused across providers. Use this only when the caller
   * is itself short-lived and owns the lifecycle of the result.
   */
  public static createDetached(): WorkspaceSymbolIndexer {
    return new WorkspaceSymbolIndexer();
  }

  private getCacheKey(fileUri: string): string {
    if (fileUri.toLowerCase().startsWith("file:")) {
      try {
        const filePath = vscode.Uri.parse(fileUri).fsPath;
        return path.normalize(filePath).toLowerCase();
      } catch {
        return fileUri.toLowerCase();
      }
    }
    return fileUri.toLowerCase();
  }

  /**
   * Checks if a file is physically present on disk or currently open in VS Code.
   */
  public isFileValid(fileUri: string): boolean {
    if (fileUri.startsWith("system://")) {
      return true;
    }
    try {
      const filePath = vscode.Uri.parse(fileUri).fsPath;
      if (fs.existsSync(filePath)) {
        return true;
      }
      const documents = vscode.workspace.textDocuments;
      const isOpen = documents.some((doc) => {
        return this.getCacheKey(doc.uri.toString()) === this.getCacheKey(fileUri);
      });
      if (isOpen) {
        return true;
      }
    } catch {
      /* fall through to false */
    }
    return false;
  }

  /**
   * Remove any cached files that no longer exist on disk and are not open in the editor
   */
  public validateCache(): void {
    for (const cacheKey of Array.from(this.cache.keys())) {
      const fileSyms = this.cache.get(cacheKey);
      if (fileSyms && !this.isFileValid(fileSyms.fileUri)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  /**
   * Scan entire workspace recursively for .bas files and index them
   */
  public async indexWorkspace(
    workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined,
  ): Promise<void> {
    this.validateCache();
    if (!workspaceFolders) return;

    for (const folder of workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      await this.scanDir(folderPath);
    }
  }

  /**
   * Re-scans a single directory recursively. Used by flows that mutate a
   * narrow slice of the workspace (e.g. `data7_modules/` right after a
   * module import) and want to avoid the cost of re-indexing every file
   * under every workspace folder.
   *
   * Caller is responsible for picking a directory that lives inside the
   * workspace; this method does NOT validate that.
   */
  public async indexDirectory(directoryPath: string): Promise<void> {
    await this.scanDir(directoryPath);
  }

  public deleteWorkspaceFolder(deletedPath: string): void {
    const deletedPathNormalized = deletedPath.endsWith(path.sep)
      ? deletedPath
      : deletedPath + path.sep;
    for (const cacheKey of Array.from(this.cache.keys())) {
      if (cacheKey === deletedPath || cacheKey.startsWith(deletedPathNormalized)) {
        this.cache.delete(cacheKey);
      }
    }
  }

  public renameWorkspaceFolder(oldPath: string, newPath: string): void {
    const oldPathNormalized = oldPath.endsWith(path.sep) ? oldPath : oldPath + path.sep;
    const newPathNormalized = newPath.endsWith(path.sep) ? newPath : newPath + path.sep;

    for (const cacheKey of Array.from(this.cache.keys())) {
      if (cacheKey === oldPath) {
        const fileSyms = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        if (fileSyms) {
          fileSyms.filePath = newPath;
          fileSyms.fileUri = vscode.Uri.file(newPath).toString();
          fileSyms.symbols.forEach((s) => {
            s.fileUri = fileSyms.fileUri;
          });
          this.cache.set(newPath, fileSyms);
        }
      } else if (cacheKey.startsWith(oldPathNormalized)) {
        const fileSyms = this.cache.get(cacheKey);
        this.cache.delete(cacheKey);
        if (fileSyms) {
          const relative = cacheKey.substring(oldPathNormalized.length);
          const newFileKey = path.join(newPathNormalized, relative).toLowerCase();
          fileSyms.filePath = path.join(newPathNormalized, relative);
          fileSyms.fileUri = vscode.Uri.file(fileSyms.filePath).toString();
          fileSyms.symbols.forEach((s) => {
            s.fileUri = fileSyms.fileUri;
          });
          this.cache.set(newFileKey, fileSyms);
        }
      }
    }

    // Also re-scan the new path to ensure any files are fresh
    this.scanDir(newPath).catch((err) => {
      logger.error("Falha ao reindexar caminho renomeado.", err);
    });
  }

  private async scanDir(dir: string): Promise<void> {
    if (!fs.existsSync(dir)) return;
    if (isExcluded(dir)) return;
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        await this.scanDir(filePath);
      } else {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".bas" || ext === ".d7b") {
          if (isExcluded(filePath)) continue;
          const fileUri = vscode.Uri.file(filePath).toString();
          this.indexFile(fileUri);
        }
      }
    }
  }

  /**
   * Parse and cache a single file by URI
   */
  public indexFile(fileUri: string): void {
    try {
      const filePath = vscode.Uri.parse(fileUri).fsPath;
      if (isExcluded(filePath)) return;
      const key = this.getCacheKey(fileUri);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = SymbolParser.parseBasFile(fileUri, content);
        appendGenericInstantiations(parsed, fileUri, content);
        this.cache.set(key, parsed);
      } else {
        this.cache.delete(key);
      }
    } catch (err: unknown) {
      logger.error(`Erro ao indexar arquivo: ${fileUri}`, err);
    }
  }

  /**
   * Update cache with active text content (useful for open editor changes)
   *
   * When the file contains generic templates / usages, we also run the
   * shared generics analyzer ({@link collectGenericsContext}) and inject
   * flat-named copies of the template members (`TList_Product`, …) into
   * the parsed symbol list, so hover/completion/signature providers
   * surface the substituted members automatically.
   *
   * The expansion is best-effort: it short-circuits when no template is
   * declared, when no usage is observed, or when the arity mismatches —
   * mirroring the warnings already reported by the live linter.
   */
  public updateFileContent(fileUri: string, content: string): void {
    try {
      const parsed = SymbolParser.parseBasFile(fileUri, content);
      appendGenericInstantiations(parsed, fileUri, content);
      this.cache.set(this.getCacheKey(fileUri), parsed);
    } catch (err: unknown) {
      logger.error(`Erro ao atualizar indexação para: ${fileUri}`, err);
    }
  }

  /**
   * Remove a file from index
   */
  public removeFile(fileUri: string): void {
    this.cache.delete(this.getCacheKey(fileUri));
  }

  /**
   * Test-only hook: clears the entire cache so tests start from a known state.
   */
  public __resetForTests(): void {
    this.cache.clear();
  }

  /**
   * Get symbols for a specific file
   */
  public getFileSymbols(fileUri: string): FileSymbols | undefined {
    const key = this.getCacheKey(fileUri);
    const fileSyms = this.cache.get(key);
    if (fileSyms && !this.isFileValid(fileSyms.fileUri)) {
      this.cache.delete(key);
      return undefined;
    }
    return fileSyms;
  }

  /**
   * Get all symbols in the workspace
   */
  public getAllSymbols(): SymbolInfo[] {
    const all: SymbolInfo[] = [];
    for (const fileSym of this.cache.values()) {
      all.push(...fileSym.symbols);
    }
    return all;
  }

  /**
   * Returns every cached `FileSymbols` entry. Used by reference/rename
   * providers that need to scan the file bodies for whole-word matches.
   */
  public getAllFileSymbols(): FileSymbols[] {
    return Array.from(this.cache.values());
  }

  /**
   * Resolve a type or namespace name by scanning imports and the global index
   */
  public findSymbolByName(name: string, contextFileUri?: string): SymbolInfo | undefined {
    const lowerName = name.toLowerCase();
    const allSymbols = this.getAllSymbols();

    // 1. Look for exact match. When more than one cached symbol shares the
    //    name (e.g. the same namespace exists in `data7_modules/` AND in a
    //    repository file that was opened outside the workspace), prefer the
    //    workspace copy. This keeps go-to-definition and hover deterministic
    //    even if the cache still holds a stale outside-workspace entry from
    //    a previous session.
    const matches = allSymbols.filter((s) => s.name.toLowerCase() === lowerName);
    let match = WorkspaceSymbolIndexer.preferWorkspaceMatch(matches);
    if (match) {
      if (this.isFileValid(match.fileUri)) {
        return match;
      } else {
        this.removeFile(match.fileUri);
        return this.findSymbolByName(name, contextFileUri);
      }
    }

    // 2. If we have imports, look under imported namespaces
    if (contextFileUri) {
      const fileSym = this.getFileSymbols(contextFileUri);
      if (fileSym) {
        for (const imp of fileSym.imports) {
          const qualifiedName = `${imp}.${name}`.toLowerCase();
          // Match qualified symbols or namespaces — keep the same
          // workspace-first preference here so an imported namespace also
          // resolves to its workspace copy when duplicates exist.
          const qualifiedMatches = allSymbols.filter((s) => {
            const symbolQualName = s.containerName
              ? `${s.containerName}.${s.name}`.toLowerCase()
              : s.name.toLowerCase();
            return symbolQualName === qualifiedName;
          });
          match = WorkspaceSymbolIndexer.preferWorkspaceMatch(qualifiedMatches);
          if (match) {
            if (this.isFileValid(match.fileUri)) {
              return match;
            } else {
              this.removeFile(match.fileUri);
              return this.findSymbolByName(name, contextFileUri);
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Returns the first match that belongs to an open workspace folder. Falls
   * back to the first entry otherwise. Centralised so every lookup path
   * applies the same precedence rule.
   */
  private static preferWorkspaceMatch(matches: readonly SymbolInfo[]): SymbolInfo | undefined {
    if (matches.length === 0) return undefined;
    if (matches.length === 1) return matches[0];
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) return matches[0];
    const isInsideWorkspace = (fileUri: string): boolean => {
      if (fileUri.startsWith("system://")) return false;
      try {
        const fsPath = vscode.Uri.parse(fileUri).fsPath;
        const normalized = path.normalize(fsPath).toLowerCase();
        return folders.some((folder) => {
          const folderPath = path.normalize(folder.uri.fsPath).toLowerCase();
          if (normalized === folderPath) return true;
          const prefix = folderPath.endsWith(path.sep) ? folderPath : folderPath + path.sep;
          return normalized.startsWith(prefix);
        });
      } catch {
        return false;
      }
    };
    const workspaceMatch = matches.find((m) => isInsideWorkspace(m.fileUri));
    return workspaceMatch ?? matches[0];
  }
}

// ============================================================================
// Generic instantiation helpers (Fase 7)
// ============================================================================

/**
 * Cheap pre-filter to avoid invoking the analyzer on files that
 * obviously carry no generic usage. Requires an UPPERCASE identifier
 * followed by `<…>` whose body has no inner `<` or newline — rejects
 * comparisons (`If x < y Then`), HTML-like text, and false positives
 * caused by `<=` / `<>` operators.
 *
 * Nested usages like `TList<TList<Integer>>` still match thanks to the
 * inner-most `TList<Integer>` sub-string.
 */
function hasGenericMarkers(content: string): boolean {
  return /\b[A-Z]\w*\s*<[^<>\n]{1,200}>/.test(content);
}

/**
 * Module-level memoization cache so back-to-back hover/completion calls
 * over the same file do not re-tokenize and re-clone the same template
 * members. Keyed by content (the indexer already creates one file entry
 * per URI; the content is the natural cache key for an open editor).
 */
const expansionCache = new WeakMap<object, SymbolInfo[]>();
const expansionCacheKeys = new Map<string, { ref: object; content: string }>();

/**
 * Returns the cached expansion for `fileUri` + `content`, or runs the
 * analyzer + member-cloning pipeline and stores the result. The key is
 * `(fileUri, content)`; when either changes the cache entry is replaced.
 */
function getOrComputeExpansion(
  fileUri: string,
  content: string,
  parsed: FileSymbols,
): SymbolInfo[] {
  const cached = expansionCacheKeys.get(fileUri);
  if (cached?.content === content) {
    const hit = expansionCache.get(cached.ref);
    if (hit) return hit;
  }
  const computed = computeGenericInstantiations(parsed, fileUri, content);
  const ref = { fileUri, content };
  expansionCacheKeys.set(fileUri, { ref, content });
  expansionCache.set(ref, computed);
  return computed;
}

/**
 * Appends synthetic flat-named symbols (`TList_Product`, …) to the
 * already-parsed `FileSymbols`. Idempotent and best-effort: when there
 * is no generic template or usage, the function returns without
 * touching `parsed`.
 *
 * Reuses the shared analyzer in {@link collectGenericsContext} so the
 * indexer, the live linter, the textual pass and the AST driver all
 * agree on which usages exist and what their flat names are.
 */
function appendGenericInstantiations(parsed: FileSymbols, fileUri: string, content: string): void {
  if (!hasGenericMarkers(content)) return;
  const extra = getOrComputeExpansion(fileUri, content, parsed);
  if (extra.length === 0) return;
  const known = new Set(parsed.symbols.map(symbolKey));
  for (const sym of extra) {
    if (!known.has(symbolKey(sym))) parsed.symbols.push(sym);
  }
}

/**
 * Joins the identifying fields of a SymbolInfo so the synthetic
 * flat-name expansion does not overwrite a textual declaration already
 * present in the file (e.g. a hand-written `Class TList_Product` next
 * to the generic template).
 */
function symbolKey(s: SymbolInfo): string {
  return `${s.containerName ?? ""}::${s.name}#${String(s.range.startLine)}`;
}

/**
 * Core of {@link appendGenericInstantiations} — builds the list of
 * synthetic SymbolInfo entries for `(template, type-args)` pairs
 * observed in `content`.
 *
 * For each usage, we emit one synthetic class symbol plus one cloned
 * member per template member (containerName === template.name). The
 * cloned member's `type`/`parameters[].type` carry the substituted
 * type-arguments so hover/completion show `Add(pValue As Product) As
 * Integer` instead of the raw `T`.
 */
function computeGenericInstantiations(
  parsed: FileSymbols,
  fileUri: string,
  content: string,
): SymbolInfo[] {
  const ctx = collectGenericsContext(content);
  if (ctx.templates.size === 0 || ctx.usages.length === 0) return [];

  // The flat-class needs the namespace its template was declared
  // inside. Build a `template name -> containerName` lookup from the
  // already-parsed symbols so we do not re-derive it textually.
  const namespaceOfTemplate = new Map<string, string | undefined>();
  for (const sym of parsed.symbols) {
    if (sym.kind !== "class" && sym.kind !== "delegate") continue;
    namespaceOfTemplate.set(sym.name.toLowerCase(), sym.containerName);
  }

  const result: SymbolInfo[] = [];
  const emitted = new Set<string>();

  for (const usage of ctx.usages) {
    const template = ctx.templates.get(usage.templateName.toLowerCase());
    if (template === undefined) continue;
    if (template.typeParams.length !== usage.typeArgs.length) continue;
    if (emitted.has(usage.flatName)) continue;
    emitted.add(usage.flatName);

    const subs = buildSubstitutions(template, usage);
    if (subs === undefined) continue;

    const containerName = namespaceOfTemplate.get(template.name.toLowerCase());
    appendSyntheticClass(result, usage, fileUri, containerName);
    appendClonedMembers(result, parsed.symbols, template, usage, subs);
  }

  return result;
}

function buildSubstitutions(
  template: GenericTemplateInfo,
  usage: GenericUsageOccurrence,
): Map<string, string> | undefined {
  const subs = new Map<string, string>();
  for (let i = 0; i < template.typeParams.length; i++) {
    const tp = template.typeParams[i];
    const ta = usage.typeArgs[i];
    if (!tp || !ta) return undefined;
    subs.set(tp, ta);
  }
  return subs;
}

function appendSyntheticClass(
  out: SymbolInfo[],
  usage: GenericUsageOccurrence,
  fileUri: string,
  containerName: string | undefined,
): void {
  out.push({
    name: usage.flatName,
    kind: "class",
    type: usage.flatName,
    isShared: false,
    isPrivate: false,
    range: {
      startLine: usage.line,
      startChar: usage.column,
      endLine: usage.line,
      endChar: usage.column + usage.flatName.length,
    },
    fileUri,
    containerName,
    description: `Instanciacao monomorfica de ${usage.templateName}<${usage.typeArgs.join(", ")}>.`,
  });
}

function appendClonedMembers(
  out: SymbolInfo[],
  source: readonly SymbolInfo[],
  template: GenericTemplateInfo,
  usage: GenericUsageOccurrence,
  subs: ReadonlyMap<string, string>,
): void {
  const templateLower = template.name.toLowerCase();
  for (const sym of source) {
    if (sym.containerName?.toLowerCase() !== templateLower) continue;
    const clone: SymbolInfo = {
      ...sym,
      type: substituteTypeName(sym.type, subs),
      containerName: usage.flatName,
    };
    if (sym.parameters !== undefined) {
      clone.parameters = sym.parameters.map((p) => ({
        ...p,
        type: substituteTypeName(p.type, subs),
      }));
    }
    out.push(clone);
  }
}

/**
 * Substitutes whole-word type parameter names inside a type string. The
 * substring `T` inside `TList` must NOT be rewritten, so we anchor with
 * `\b`. Type parameters are always plain identifiers (ASCII letters,
 * digits, underscore), so no regex escaping is needed.
 */
function substituteTypeName(type: string, subs: ReadonlyMap<string, string>): string {
  if (subs.size === 0 || type.length === 0) return type;
  let out = type;
  for (const [tp, ta] of subs) {
    out = out.replace(new RegExp(`\\b${tp}\\b`, "g"), ta);
  }
  return out;
}
