import type * as vscode from "../platform/vscode-api";
import { WorkspaceDependencyGraph } from "./workspace-dependency-graph";

interface SemanticLintEntry {
  readonly fingerprint: string;
  readonly diagnostics: readonly vscode.Diagnostic[];
}

/**
 * Caches the output of `DiagnosticsLinter.runAdvancedDiagnostics` per file.
 * Invalidated when file content or imported-namespace revisions change.
 */
export class SemanticLintCache {
  private static instance: SemanticLintCache | undefined;
  private readonly entries = new Map<string, SemanticLintEntry>();

  public static getInstance(): SemanticLintCache {
    SemanticLintCache.instance ??= new SemanticLintCache();
    return SemanticLintCache.instance;
  }

  public static resetForTests(): void {
    SemanticLintCache.instance?.clear();
    SemanticLintCache.instance = undefined;
  }

  public clear(): void {
    this.entries.clear();
  }

  private entryKey(cacheScope: string, fileUri: string): string {
    return `${cacheScope}|${this.normalizeUri(fileUri)}`;
  }

  public get(
    cacheScope: string,
    fileUri: string,
    fingerprint: string,
  ): readonly vscode.Diagnostic[] | undefined {
    const entry = this.entries.get(this.entryKey(cacheScope, fileUri));
    if (!entry || entry.fingerprint !== fingerprint) {
      return undefined;
    }
    return entry.diagnostics;
  }

  public set(
    cacheScope: string,
    fileUri: string,
    fingerprint: string,
    diagnostics: readonly vscode.Diagnostic[],
  ): void {
    this.entries.set(this.entryKey(cacheScope, fileUri), { fingerprint, diagnostics });
  }

  public invalidate(cacheScope: string, fileUri: string): void {
    this.entries.delete(this.entryKey(cacheScope, fileUri));
  }

  /**
   * Drops cache entries for files that import any namespace declared in `triggerUri`.
   */
  public invalidateDependents(
    cacheScope: string,
    triggerUri: string,
    dependencyGraph: WorkspaceDependencyGraph,
    extraNamespaces: ReadonlySet<string> = new Set<string>(),
  ): void {
    const dependentUris = dependencyGraph.getDependentFileUris(triggerUri, extraNamespaces);
    for (const uri of dependentUris) {
      this.invalidate(cacheScope, uri);
    }
  }

  private normalizeUri(uri: string): string {
    return uri.toLowerCase();
  }
}
