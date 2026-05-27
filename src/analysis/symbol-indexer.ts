import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { logger } from "../infra/logger";
import { IMPORTS_REGEX_ANCHORED } from "./dependency-scanner";
import { isExcluded } from "../infra/configuration";

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
      const line = lines[lineIdx];
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
      if (importMatch) {
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
      if (nsMatch) {
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
      if (inheritsMatch && activeClass) {
        activeClass.inheritsFrom = inheritsMatch[1];
        pendingDescription = "";
        continue;
      }

      // 7. Class start
      const classMatch = /^(?:(Private|Public|Protected|Shared)\s+)*Class\s+([a-zA-Z0-9_]+)/i.exec(
        trimmed,
      );
      if (classMatch) {
        const modifiers = (classMatch[0] || "").toLowerCase();
        const isPrivate = modifiers.includes("private");
        const isShared = modifiers.includes("shared");
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
      if (structMatch) {
        const modifiers = (structMatch[0] || "").toLowerCase();
        const isPrivate = modifiers.includes("private");
        const isShared = modifiers.includes("shared");
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
        /^(?:(Private|Public|Protected|Shared|ReadOnly|WriteOnly)\s+)*Property\s+([a-zA-Z0-9_]+)(?:\s+As\s+([a-zA-Z0-9_.]+))?/i.exec(
          trimmed,
        );
      if (propMatch) {
        const modifiers = (propMatch[0] || "").toLowerCase();
        const isPrivate = modifiers.includes("private");
        const isShared = modifiers.includes("shared");
        const name = propMatch[2];
        const type = propMatch[3] || "Variant";

        const propSymbol: SymbolInfo = {
          name,
          kind: "property",
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
        fileSymbols.symbols.push(propSymbol);
        activeProperty = propSymbol;
        pendingDescription = "";
        continue;
      }

      // 12. Delegate
      const delegateMatch =
        /^(?:(Private|Public|Protected|Shared)\s+)*Delegate\s+(Sub|Function)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)(?:\s+As\s+([a-zA-Z0-9_.]+))?/i.exec(
          trimmed,
        );
      if (delegateMatch) {
        const modifiers = (delegateMatch[0] || "").toLowerCase();
        const isPrivate = modifiers.includes("private");
        const isShared = modifiers.includes("shared");
        const name = delegateMatch[3];
        const params = this.parseParameters(delegateMatch[4]);
        const type =
          delegateMatch[5] || (delegateMatch[2].toLowerCase() === "sub" ? "Void" : "Variant");

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
        /^(?:(Private|Public|Protected|Shared)\s+)*Declare\s+(Sub|Function)\s+([a-zA-Z0-9_]+)\s+Lib\s+"([^"]+)"(?:\s+Alias\s+"([^"]+)")?\s*\(([^)]*)\)(?:\s+As\s+([a-zA-Z0-9_.]+))?/i.exec(
          trimmed,
        );
      if (declareMatch) {
        const modifiers = declareMatch[1] ? declareMatch[1].toLowerCase() : "";
        const isPrivate = modifiers.includes("private") || modifiers === "";
        const isShared = true;
        const kind = declareMatch[2].toLowerCase() === "sub" ? "declare_sub" : "declare_function";
        const name = declareMatch[3];
        const params = this.parseParameters(declareMatch[6]);
        const type =
          declareMatch[7] || (declareMatch[2].toLowerCase() === "sub" ? "Void" : "Variant");

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
          description: pendingDescription || `Importação de API Win32 de ${declareMatch[4]}`,
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
        /^(?:(Private|Public|Protected|Shared|Overridable|Overrides)\s+)*(Sub|Function)\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]*)\))?(?:\s+As\s+([a-zA-Z0-9_.]+))?/i.exec(
          trimmed,
        );
      if (methodMatch) {
        const modifiers = (methodMatch[0] || "").toLowerCase();
        const isPrivate = modifiers.includes("private");
        const isShared = modifiers.includes("shared") || (!activeClass && !!activeNamespace);
        const name = methodMatch[3];
        const params = this.parseParameters(methodMatch[4]);
        const type =
          methodMatch[5] || (methodMatch[2].toLowerCase() === "sub" ? "Void" : "Variant");

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
          /^(?:(Private|Public|Protected|Shared|ReadOnly|WriteOnly)\s+)*(?:Dim\s+)?([a-zA-Z0-9_]+)(?:\s+As\s+(?:New\s+)?([a-zA-Z0-9_.]+))?/i.exec(
            trimmed,
          );
        if (varMatch && (activeClass || activeStructure || activeNamespace)) {
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
            const modifiers = (varMatch[0] || "").toLowerCase();
            const isPrivate =
              modifiers.includes("private") ||
              (!modifiers.includes("public") && !modifiers.includes("shared"));
            const isShared = modifiers.includes("shared") || (!activeClass && !!activeNamespace);
            const type = varMatch[3] || "Variant";

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
   */
  public updateFileContent(fileUri: string, content: string): void {
    try {
      const parsed = SymbolParser.parseBasFile(fileUri, content);
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

    // 1. Look for exact match
    let match = allSymbols.find((s) => s.name.toLowerCase() === lowerName);
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
          // Match qualified symbols or namespaces
          match = allSymbols.find((s) => {
            const symbolQualName = s.containerName
              ? `${s.containerName}.${s.name}`.toLowerCase()
              : s.name.toLowerCase();
            return symbolQualName === qualifiedName;
          });
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
   * Find a class member (method, property, variable, etc.) in a class or its parents recursively in the workspace
   */
  public findClassMember(className: string, memberName: string): SymbolInfo | undefined {
    const memberLower = memberName.toLowerCase();
    const allSymbols = this.getAllSymbols();

    // Scan current class in workspace
    let match = allSymbols.find(
      (s) =>
        s.containerName?.toLowerCase() === className.toLowerCase() &&
        s.name.toLowerCase() === memberLower,
    );
    if (match) {
      if (this.isFileValid(match.fileUri)) {
        return match;
      } else {
        this.removeFile(match.fileUri);
        return this.findClassMember(className, memberName);
      }
    }

    // Scan parent classes recursively in workspace
    let currentClass = this.findSymbolByName(className);
    const visited = new Set<string>();
    while (currentClass?.inheritsFrom && !visited.has(currentClass.name.toLowerCase())) {
      visited.add(currentClass.name.toLowerCase());
      const parentName = currentClass.inheritsFrom;

      match = allSymbols.find(
        (s) =>
          s.containerName?.toLowerCase() === parentName.toLowerCase() &&
          s.name.toLowerCase() === memberLower,
      );
      if (match) {
        if (this.isFileValid(match.fileUri)) {
          return match;
        } else {
          this.removeFile(match.fileUri);
          return this.findClassMember(className, memberName);
        }
      }

      currentClass = this.findSymbolByName(parentName);
    }

    return undefined;
  }
}
