import * as fs from "node:fs";
import * as vscode from "vscode";
import { parseBasic, tokenize, GenericsParserPlugin, parseExpr } from "../project/parser";
import type { CompilationUnit, Expression } from "../project/ast/ast";
import type { ParseError } from "../project/parser/parser-errors";
import type { Token } from "../project/parser/token-types";
import { logger } from "../infra/logger";
import { readConfiguration } from "../infra/configuration";
import { SugarEngine } from "../project/sugars";

export interface CachedDocument {
  readonly uri: string;
  readonly unit: CompilationUnit;
  readonly tokens: readonly Token[];
  readonly errors: readonly ParseError[];
  readonly version: number;
  readonly content?: string;
}

export class LanguageProcessor {
  private static instance: LanguageProcessor | undefined;
  private readonly cache = new Map<string, CachedDocument>();
  private readonly debouncers = new Map<string, NodeJS.Timeout>();

  private constructor() {
    try {
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("data7")) {
          this.clearCache();
        }
      });
    } catch {
      // Ignore errors when running outside VS Code extension host (e.g. unit tests)
    }
  }

  public clearCache(): void {
    this.cache.clear();
    for (const debouncer of this.debouncers.values()) {
      clearTimeout(debouncer);
    }
    this.debouncers.clear();
  }

  public static getInstance(): LanguageProcessor {
    LanguageProcessor.instance ??= new LanguageProcessor();
    return LanguageProcessor.instance;
  }

  /**
   * Parses an expression string into an AST Expression node.
   */
  public parseExpression(exprText: string): Expression {
    return parseExpr(exprText);
  }

  /**
   * Retrieves the cached AST and tokens for a given document URI, or parses it on-demand.
   */
  public getOrParse(uri: string, content?: string): CachedDocument {
    const key = this.normalizeUri(uri);
    const cached = this.cache.get(key);

    if (cached) {
      if (content === undefined || cached.content === content) {
        return cached;
      }
    }

    let actualContent = content;
    actualContent ??= this.readDocumentContent(uri) ?? "";

    return this.parseAndCache(uri, actualContent, 0);
  }

  /**
   * Returns a cached document if available, without forcing synchronous parsing or read.
   */
  public getCached(uri: string): CachedDocument | undefined {
    return this.cache.get(this.normalizeUri(uri));
  }

  /**
   * Invalidates a document from the cache.
   */
  public invalidate(uri: string): void {
    const key = this.normalizeUri(uri);
    this.cache.delete(key);
    const debouncer = this.debouncers.get(key);
    if (debouncer) {
      clearTimeout(debouncer);
      this.debouncers.delete(key);
    }
  }

  /**
   * Processes a change in a document, triggering a debounced re-parse.
   */
  public handleDocumentChange(uri: string, content: string, version: number): void {
    const key = this.normalizeUri(uri);
    const existingDebouncer = this.debouncers.get(key);
    if (existingDebouncer) {
      clearTimeout(existingDebouncer);
    }

    const debouncer = setTimeout(() => {
      this.debouncers.delete(key);
      try {
        this.parseAndCache(uri, content, version);
        // Trigger diagnostics refresh here if needed
        vscode.commands.executeCommand("data7.refreshDiagnostics", uri);
      } catch (err: unknown) {
        logger.error(`Error debounced parsing: ${uri}`, err);
      }
    }, 150); // 150ms debounce

    this.debouncers.set(key, debouncer);
  }

  private parseAndCache(uri: string, content: string, version: number): CachedDocument {
    const key = this.normalizeUri(uri);
    try {
      const sugarConfig = readConfiguration().sugars;
      const sugarEngine = new SugarEngine({
        enabled: sugarConfig.enabled,
        enabledSugarIds: sugarConfig.enabledIds,
        disabledSugarIds: sugarConfig.disabledIds,
      });
      const plugins = [...sugarEngine.createParserPlugins(), new GenericsParserPlugin()];
      const { unit, errors } = parseBasic(content, { plugins });
      const tokens = tokenize(content);
      const cachedDoc: CachedDocument = {
        uri,
        unit,
        tokens,
        errors,
        version,
        content,
      };
      this.cache.set(key, cachedDoc);
      return cachedDoc;
    } catch (err: unknown) {
      logger.error(`Parser crashed on document: ${uri}`, err);
      // Fallback empty unit on crash
      const cachedDoc: CachedDocument = {
        uri,
        unit: { kind: "CompilationUnit", members: [] },
        tokens: [],
        errors: [],
        version,
        content,
      };
      this.cache.set(key, cachedDoc);
      return cachedDoc;
    }
  }

  private normalizeUri(uri: string): string {
    return uri.toLowerCase();
  }

  private readDocumentContent(uriStr: string): string | undefined {
    try {
      const uri = vscode.Uri.parse(uriStr);
      // Try to find if already opened in vscode workspace
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString().toLowerCase() === uriStr.toLowerCase(),
      );
      if (doc) {
        return doc.getText();
      }
      // If not, read from file system
      if (uri.scheme === "file") {
        const fsPath = uri.fsPath;
        if (fs.existsSync(fsPath)) {
          return fs.readFileSync(fsPath, "utf-8");
        }
      }
    } catch (err) {
      logger.error(`Failed to read document: ${uriStr}`, err);
    }
    return undefined;
  }
}
