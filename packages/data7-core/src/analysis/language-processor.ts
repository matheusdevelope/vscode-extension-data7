import * as vscode from "../platform/vscode-api";
import { parseBasic, parseExpr } from "../project/parser";
import type { CompilationUnit, Expression } from "../project/ast/ast";
import type { ParseError } from "../project/parser/parser-errors";
import type { Token } from "../project/parser/token-types";
import { logger } from "../infra/logger";
import { SemanticLintCache } from "./semantic-lint-cache";
import { DeclarationLintCache } from "./declaration-lint-cache";
import {
  clearLocalScopeIndexCache,
  clearLintTypeResolutionCachesForUnit,
} from "./lint-type-resolution-cache";
import { computeParseConfigSignature, createConfiguredParseOptions } from "./parse-config";
import { getAnalysisHost } from "./analysis-host";
import { hashContent } from "../utils/content-hash";

export interface CachedDocument {
  readonly uri: string;
  readonly unit: CompilationUnit;
  readonly tokens: readonly Token[];
  readonly errors: readonly ParseError[];
  readonly version: number;
  readonly content?: string;
  /** Identity of `content`, so a cache hit never compares two full documents. */
  readonly contentHash?: string;
}

export class LanguageProcessor {
  private static instance: LanguageProcessor | undefined;
  private readonly cache = new Map<string, CachedDocument>();
  private readonly debouncers = new Map<string, NodeJS.Timeout>();
  private parseConfigSignature = "";

  private constructor() {
    try {
      this.parseConfigSignature = computeParseConfigSignature();
      getAnalysisHost().onDidChangeConfiguration((section) => {
        if (section === "data7") {
          this.handleConfigurationChanged();
        }
      });
    } catch {
      // Ignore errors when running outside VS Code extension host (e.g. unit tests)
    }
  }

  /**
   * Only settings that change parser output invalidate cached ASTs. Everything
   * else (severity overrides, excludes) invalidates lint results alone, so a
   * severity tweak no longer re-parses the whole workspace.
   */
  public handleConfigurationChanged(): void {
    let nextSignature = this.parseConfigSignature;
    try {
      nextSignature = computeParseConfigSignature();
    } catch {
      // Unreadable configuration: fall back to the conservative full reset.
      this.clearCache();
      return;
    }

    if (nextSignature !== this.parseConfigSignature) {
      this.parseConfigSignature = nextSignature;
      this.clearCache();
      return;
    }
    this.clearLintCaches();
  }

  public clearCache(): void {
    this.cache.clear();
    this.clearLintCaches();
    for (const debouncer of this.debouncers.values()) {
      clearTimeout(debouncer);
    }
    this.debouncers.clear();
  }

  private clearLintCaches(): void {
    SemanticLintCache.getInstance().clear();
    DeclarationLintCache.getInstance().clear();
    clearLocalScopeIndexCache();
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
  public getOrParse(uri: string, content?: string, version = 0): CachedDocument {
    const key = this.normalizeUri(uri);
    const cached = this.cache.get(key);

    if (cached) {
      if (content === undefined) {
        return cached;
      }
      // A buffer version identifies its text exactly, so an editor-driven hit
      // costs a number comparison. Disk-driven callers (version 0) fall back to
      // the content hash — never to comparing two full documents, which made
      // the cache probe itself expensive on large files.
      if (version > 0 && cached.version === version) {
        return cached;
      }
      if (cached.contentHash !== undefined && cached.contentHash === hashContent(content)) {
        return cached;
      }
    }

    let actualContent = content;
    actualContent ??= this.readDocumentContent(uri) ?? "";

    return this.parseAndCache(uri, actualContent, version);
  }

  /**
   * Returns a cached document if available, without forcing synchronous parsing or read.
   */
  public getCached(uri: string): CachedDocument | undefined {
    return this.cache.get(this.normalizeUri(uri));
  }

  /**
   * Returns a cached document only when the buffer version matches.
   */
  public getCachedForVersion(uri: string, version: number): CachedDocument | undefined {
    const cached = this.getCached(uri);
    if (!cached || cached.version !== version) return undefined;
    return cached;
  }

  /**
   * Invalidates a document from the cache.
   */
  public invalidate(uri: string): void {
    const key = this.normalizeUri(uri);
    const cached = this.cache.get(key);
    if (cached?.unit) {
      clearLintTypeResolutionCachesForUnit(cached.unit);
    }
    this.cache.delete(key);
    const debouncer = this.debouncers.get(key);
    if (debouncer) {
      clearTimeout(debouncer);
      this.debouncers.delete(key);
    }
  }

  /**
   * Processes a change in a document, triggering a debounced re-parse.
   * Prefer AnalysisProgram.update for the unified path; kept for compatibility.
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
      } catch (err: unknown) {
        logger.error(`Error debounced parsing: ${uri}`, err);
      }
    }, 300); // AST cache refresh only; lint is orchestrated by DiagnosticService

    this.debouncers.set(key, debouncer);
  }

  public parseAndCache(uri: string, content: string, version: number): CachedDocument {
    const key = this.normalizeUri(uri);
    const contentHash = hashContent(content);
    try {
      const { unit, errors, tokens } = parseBasic(content, createConfiguredParseOptions());
      const cachedDoc: CachedDocument = {
        uri,
        unit,
        tokens,
        errors,
        version,
        content,
        contentHash,
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
        contentHash,
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
      const host = getAnalysisHost();
      const open = host.getOpenDocument(uriStr);
      if (open) {
        return open.getText();
      }
      const uri = vscode.Uri.parse(uriStr);
      if (uri.scheme === "file") {
        const fsPath = uri.fsPath;
        if (host.fs.existsSync(fsPath)) {
          return host.fs.readFileSync(fsPath);
        }
      }
    } catch (err) {
      logger.error(`Failed to read document: ${uriStr}`, err);
    }
    return undefined;
  }
}
