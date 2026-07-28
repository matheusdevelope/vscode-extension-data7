import * as vscode from "../platform/vscode-api";
import { hashContent } from "../utils/content-hash";
import { LanguageProcessor } from "./language-processor";
import type { CachedDocument } from "./language-processor";
import { SymbolParser, WorkspaceSymbolIndexer, type FileSymbols } from "./symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { LintUnitIndex } from "../diagnostics/lint-unit-index";
import { warmLintTypeResolutionIndexes } from "./type-resolver";
import { LintPipelineProfiler } from "./lint-pipeline-profiler";
import { buildMockDocument } from "../utils/text-edit-utils";
import type {
  AnalysisCancellation,
  AnalysisPriority,
  CheckResult,
  FileSnapshot,
} from "./file-snapshot";
import { CheckScheduler } from "./check-scheduler";
import { buildExpressionTypeMap } from "./expression-type-map";

const LARGE_FILE_LOC_THRESHOLD = 2500;
const LARGE_FILE_CHECK_MS_THRESHOLD = 400;

/**
 * Single analysis host: parse → symbols → bind/check share one versioned snapshot.
 */
export class AnalysisProgram {
  private static instance: AnalysisProgram | undefined;
  private readonly snapshots = new Map<string, FileSnapshot>();
  private readonly indexer: WorkspaceSymbolIndexer;
  private readonly processor = LanguageProcessor.getInstance();
  private readonly scheduler = new CheckScheduler((uri, token) => this.runCheck(uri, token));

  private constructor(indexer?: WorkspaceSymbolIndexer) {
    this.indexer = indexer ?? WorkspaceSymbolIndexer.getInstance();
  }

  public static getInstance(): AnalysisProgram {
    AnalysisProgram.instance ??= new AnalysisProgram();
    return AnalysisProgram.instance;
  }

  public static createDetached(indexer: WorkspaceSymbolIndexer): AnalysisProgram {
    return new AnalysisProgram(indexer);
  }

  public static resetForTests(): void {
    AnalysisProgram.instance?.clear();
    AnalysisProgram.instance = undefined;
  }

  public getWorkspaceIndex(): WorkspaceSymbolIndexer {
    return this.indexer;
  }

  public clear(): void {
    this.snapshots.clear();
    this.scheduler.clear();
  }

  public open(uri: string, text: string, version: number): FileSnapshot {
    return this.update(uri, text, version);
  }

  public update(uri: string, text: string, version: number): FileSnapshot {
    const key = this.normalizeUri(uri);
    const contentHash = hashContent(text);
    const existing = this.snapshots.get(key);
    if (existing && existing.contentHash === contentHash && existing.version === version) {
      return existing;
    }

    const cached = this.processor.getOrParse(uri, text, version);
    const symbols = SymbolParser.parseFromAst(uri, text, cached.unit);
    this.indexer.updateFileContentFromParsed(uri, text, symbols);

    const snapshot: FileSnapshot = {
      uri,
      version,
      contentHash,
      content: text,
      unit: cached.unit,
      tokens: cached.tokens,
      errors: cached.errors,
      symbols,
    };
    // Content/version change invalidates prior bind/check.
    this.snapshots.set(key, snapshot);
    return snapshot;
  }

  public close(uri: string): void {
    const key = this.normalizeUri(uri);
    this.snapshots.delete(key);
    this.scheduler.cancel(uri);
    this.processor.invalidate(uri);
  }

  public getSnapshot(uri: string): FileSnapshot | undefined {
    return this.snapshots.get(this.normalizeUri(uri));
  }

  public getSnapshotForVersion(uri: string, version: number): FileSnapshot | undefined {
    const snap = this.getSnapshot(uri);
    if (!snap || snap.version !== version) return undefined;
    return snap;
  }

  /**
   * Ensures parse+index are current for providers without waiting for lint debounce.
   */
  public ensureParsed(uri: string, text: string, version: number): FileSnapshot {
    const existing = this.getSnapshotForVersion(uri, version);
    if (existing && existing.content === text) return existing;
    return this.update(uri, text, version);
  }

  /**
   * Runs semantic check (or returns cached CheckResult). Cancelable.
   * Cached results are invalidated when imported-namespace revisions change.
   */
  public ensureChecked(
    uri: string,
    text: string,
    version: number,
    token?: AnalysisCancellation,
    priority: AnalysisPriority = "active",
  ): CheckResult {
    const snapshot = this.ensureParsed(uri, text, version);
    const dependencyFingerprint = this.indexer.buildLintDependencyFingerprint(uri);

    if (
      snapshot.checkResult &&
      !snapshot.checkResult.cancelled &&
      snapshot.bindIndex?.dependencyFingerprint === dependencyFingerprint
    ) {
      return snapshot.checkResult;
    }

    // Dependency graph / index revisions changed — force a fresh check.
    snapshot.checkResult = undefined;
    if (snapshot.bindIndex?.dependencyFingerprint !== dependencyFingerprint) {
      snapshot.bindIndex = undefined;
    }

    if (this.shouldOffload(snapshot)) {
      // Schedule async worker path; still return a sync check for immediate consumers.
      this.scheduler.enqueue(uri, priority);
    }

    return this.runCheckOnSnapshot(snapshot, token);
  }

  /**
   * Drops cached check/bind results (e.g. after cold workspace index completes).
   */
  public invalidateAllChecks(): void {
    for (const snapshot of this.snapshots.values()) {
      snapshot.checkResult = undefined;
      snapshot.bindIndex = undefined;
    }
  }

  public scheduleCheck(uri: string, priority: AnalysisPriority = "background"): void {
    this.scheduler.enqueue(uri, priority);
  }

  public async flushScheduled(token?: AnalysisCancellation): Promise<void> {
    await this.scheduler.flush(token);
  }

  private shouldOffload(snapshot: FileSnapshot): boolean {
    const loc = snapshot.content.split(/\r?\n/).length;
    if (loc >= LARGE_FILE_LOC_THRESHOLD) return true;
    const last = snapshot.checkResult?.checkedAtMs;
    return last !== undefined && last >= LARGE_FILE_CHECK_MS_THRESHOLD;
  }

  private runCheck(uri: string, token?: AnalysisCancellation): CheckResult | undefined {
    const snapshot = this.getSnapshot(uri);
    if (!snapshot) return undefined;
    return this.runCheckOnSnapshot(snapshot, token);
  }

  private runCheckOnSnapshot(snapshot: FileSnapshot, token?: AnalysisCancellation): CheckResult {
    const started = Date.now();
    const isCancelled = (): boolean => !!token?.isCancellationRequested;

    if (!snapshot.bindIndex) {
      const unitIndex = LintUnitIndex.build(snapshot.unit);
      snapshot.bindIndex = {
        unitIndex,
        dependencyFingerprint: this.indexer.buildLintDependencyFingerprint(snapshot.uri),
      };
    }

    const document = buildMockDocument(vscode.Uri.parse(snapshot.uri), snapshot.content);
    // Bind indexes (scopes / line context / with-scope) once per version.
    warmLintTypeResolutionIndexes(snapshot.unit, document, this.indexer);
    // TypeMap pass: fill expression-type WeakMaps once so rules share resolutions.
    buildExpressionTypeMap(snapshot.unit, document, this.indexer);

    const diagnostics = LintPipelineProfiler.measure("advanced-lint", snapshot.uri, () =>
      DiagnosticsLinter.runAdvancedDiagnostics(document, this.indexer, { isCancelled }),
    );

    const cancelled = isCancelled();
    const result: CheckResult = {
      diagnostics,
      checkedAtMs: Date.now() - started,
      cancelled,
    };
    if (!cancelled) {
      snapshot.checkResult = result;
    }
    return result;
  }

  private normalizeUri(uri: string): string {
    return uri.toLowerCase();
  }
}

export type { CachedDocument, FileSymbols };
