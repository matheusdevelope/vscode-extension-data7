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
  BindIndex,
  CheckResult,
  FileSnapshot,
} from "./file-snapshot";
import { CheckScheduler } from "./check-scheduler";
import { buildExpressionTypeMap } from "./expression-type-map";
import { ReachabilityParseCache } from "./declaration-reachability/parse-cache";
import { isBasicSourcePath } from "../infra/constants";

const LARGE_FILE_LOC_THRESHOLD = 2500;
const LARGE_FILE_CHECK_MS_THRESHOLD = 400;

/** Notified whenever the scheduler finishes a check the host may want to publish. */
export type CheckCompletedListener = (uri: string, result: CheckResult) => void;

/**
 * Single analysis host: parse → symbols → bind/check share one versioned snapshot.
 */
export class AnalysisProgram {
  private static instance: AnalysisProgram | undefined;
  private readonly snapshots = new Map<string, FileSnapshot>();
  private readonly indexer: WorkspaceSymbolIndexer;
  private readonly processor = LanguageProcessor.getInstance();
  private readonly scheduler = new CheckScheduler((uri, token) => this.runCheck(uri, token));
  private readonly checkListeners = new Set<CheckCompletedListener>();

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
    AnalysisProgram.instance?.dispose();
    AnalysisProgram.instance = undefined;
  }

  public getWorkspaceIndex(): WorkspaceSymbolIndexer {
    return this.indexer;
  }

  public clear(): void {
    this.snapshots.clear();
    this.scheduler.clear();
  }

  public dispose(): void {
    this.snapshots.clear();
    this.checkListeners.clear();
    this.scheduler.dispose();
  }

  /**
   * Subscribes to checks completed by the background driver so the host can
   * publish diagnostics that were answered with stale data.
   */
  public onCheckCompleted(listener: CheckCompletedListener): () => void {
    this.checkListeners.add(listener);
    return () => {
      this.checkListeners.delete(listener);
    };
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

    // An edit landed: speculative background checks must step aside.
    this.scheduler.interrupt();

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
      // Content/version change invalidates bind/check but not the stale fallback.
      lastCompletedCheck: existing?.lastCompletedCheck,
    };
    this.snapshots.set(key, snapshot);
    return snapshot;
  }

  /**
   * The editor tab was closed. Frees the in-memory snapshot but keeps the file's
   * symbols indexed: a workspace file that is not open is still part of the
   * program and must keep resolving for other files.
   */
  public closeDocument(uri: string): void {
    const key = this.normalizeUri(uri);
    this.snapshots.delete(key);
    this.scheduler.cancel(uri);
    this.processor.invalidate(uri);
  }

  /**
   * The file left the workspace (deleted or moved away). Counterpart of
   * {@link closeDocument}: here the symbols must go too, otherwise the indexer
   * keeps resolving types that no longer exist.
   */
  public deleteFile(uri: string): void {
    this.closeDocument(uri);
    ReachabilityParseCache.getInstance().invalidate(uri);
    this.indexer.removeFile(uri);
  }

  /**
   * Move/rename applied as a single transition. Doing it as an independent
   * delete plus create left a window where the old URI was still registered as
   * a namespace declarer while the new one was not, so propagation targeted a
   * file that no longer existed.
   */
  public renameFile(oldUri: string, newUri: string): void {
    const oldKey = this.normalizeUri(oldUri);
    this.snapshots.delete(oldKey);
    this.scheduler.cancel(oldUri);
    this.processor.invalidate(oldUri);
    ReachabilityParseCache.getInstance().invalidate(oldUri);

    this.snapshots.delete(this.normalizeUri(newUri));
    this.scheduler.cancel(newUri);
    this.processor.invalidate(newUri);
    ReachabilityParseCache.getInstance().invalidate(newUri);

    this.indexer.renameWorkspaceFolder(
      vscode.Uri.parse(oldUri).fsPath.toLowerCase(),
      vscode.Uri.parse(newUri).fsPath.toLowerCase(),
    );
    if (isBasicSourcePath(newUri)) {
      this.indexer.indexFile(newUri);
    }
  }

  /** True when the snapshot already reflects exactly this text. */
  public matchesContent(uri: string, text: string): boolean {
    const snapshot = this.snapshots.get(this.normalizeUri(uri));
    if (!snapshot) return false;
    return snapshot.contentHash === hashContent(text);
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
    const parsed = this.ensureParsed(uri, text, version);
    const dependencyFingerprint = this.indexer.buildLintDependencyFingerprint(uri);

    if (
      parsed.checkResult &&
      !parsed.checkResult.cancelled &&
      parsed.bindIndex?.dependencyFingerprint === dependencyFingerprint
    ) {
      return parsed.checkResult;
    }

    // Dependency graph / index revisions changed. Derive a cleared snapshot
    // instead of mutating the published one, so a concurrent reader never sees
    // a snapshot whose bind index no longer matches its check result.
    const snapshot = this.publish({
      ...parsed,
      checkResult: undefined,
      bindIndex:
        parsed.bindIndex?.dependencyFingerprint === dependencyFingerprint
          ? parsed.bindIndex
          : undefined,
    });

    if (this.shouldOffload(snapshot)) {
      this.scheduler.enqueue(uri, priority);
      const fallback = snapshot.lastCompletedCheck;
      if (fallback) {
        // Blocking the keystroke path on a multi-hundred-ms check is what made the
        // editor stutter. Answer with the previous result and let the driver
        // publish the fresh one through onCheckCompleted.
        return { ...fallback, stale: true };
      }
    }

    return this.runCheckOnSnapshot(snapshot, token);
  }

  /**
   * Drops cached check/bind results (e.g. after cold workspace index completes).
   */
  public invalidateAllChecks(): void {
    for (const [key, snapshot] of this.snapshots) {
      this.snapshots.set(key, { ...snapshot, checkResult: undefined, bindIndex: undefined });
    }
  }

  /** Drops cached check/bind for a single file without discarding the parse snapshot. */
  public invalidateCheck(uri: string): void {
    const key = this.normalizeUri(uri);
    const snapshot = this.snapshots.get(key);
    if (!snapshot) return;
    this.snapshots.set(key, { ...snapshot, checkResult: undefined, bindIndex: undefined });
  }

  public scheduleCheck(uri: string, priority: AnalysisPriority = "background"): void {
    this.scheduler.enqueue(uri, priority);
  }

  public cancelScheduledCheck(uri: string): void {
    this.scheduler.cancel(uri);
  }

  public isCheckScheduled(uri: string): boolean {
    return this.scheduler.isScheduled(uri);
  }

  public get scheduledCheckCount(): number {
    return this.scheduler.size;
  }

  /** Lets the host push speculative work aside while the user types. */
  public interruptScheduledChecks(): void {
    this.scheduler.interrupt();
  }

  public async flushScheduled(token?: AnalysisCancellation): Promise<void> {
    await this.scheduler.flush(token);
  }

  private shouldOffload(snapshot: FileSnapshot): boolean {
    const loc = snapshot.content.split(/\r?\n/).length;
    if (loc >= LARGE_FILE_LOC_THRESHOLD) return true;
    // `checkResult` is cleared before this call, so the previous cost has to be
    // read from the retained result — otherwise this branch was dead code.
    const last = snapshot.lastCompletedCheck?.checkedAtMs;
    return last !== undefined && last >= LARGE_FILE_CHECK_MS_THRESHOLD;
  }

  private runCheck(uri: string, token?: AnalysisCancellation): CheckResult | undefined {
    const snapshot = this.getSnapshot(uri);
    if (!snapshot) return undefined;
    const result = this.runCheckOnSnapshot(snapshot, token);
    if (!result.cancelled) {
      this.notifyCheckCompleted(uri, result);
    }
    return result;
  }

  private notifyCheckCompleted(uri: string, result: CheckResult): void {
    for (const listener of this.checkListeners) {
      try {
        listener(uri, result);
      } catch {
        // A misbehaving listener must not abort the driver's slice.
      }
    }
  }

  /**
   * Publishes a derived snapshot, but only while the map still holds the same
   * `(version, contentHash)` it was derived from. A check that finished after an
   * edit must not resurrect results computed for the previous text.
   */
  private publish(next: FileSnapshot): FileSnapshot {
    const key = this.normalizeUri(next.uri);
    const current = this.snapshots.get(key);
    if (current && (current.version !== next.version || current.contentHash !== next.contentHash)) {
      return current;
    }
    this.snapshots.set(key, next);
    return next;
  }

  private runCheckOnSnapshot(snapshot: FileSnapshot, token?: AnalysisCancellation): CheckResult {
    const started = Date.now();
    const isCancelled = (): boolean => !!token?.isCancellationRequested;

    const bindIndex: BindIndex = snapshot.bindIndex ?? {
      unitIndex: LintUnitIndex.build(snapshot.unit),
      dependencyFingerprint: this.indexer.buildLintDependencyFingerprint(snapshot.uri),
    };

    const document = buildMockDocument(vscode.Uri.parse(snapshot.uri), snapshot.content);
    // Bind indexes (scopes / line context / with-scope) once per version.
    warmLintTypeResolutionIndexes(snapshot.unit, document, this.indexer, isCancelled);
    // TypeMap pass: fill expression-type WeakMaps once so rules share resolutions.
    buildExpressionTypeMap(snapshot.unit, document, this.indexer, isCancelled);

    if (isCancelled()) {
      // The bind index is still valid for this text, so keep it for the retry.
      this.publish({ ...snapshot, bindIndex });
      return { diagnostics: [], checkedAtMs: Date.now() - started, cancelled: true };
    }

    const diagnostics = LintPipelineProfiler.measure("advanced-lint", snapshot.uri, () =>
      DiagnosticsLinter.runAdvancedDiagnostics(document, this.indexer, { isCancelled }),
    );

    const cancelled = isCancelled();
    const result: CheckResult = {
      diagnostics,
      checkedAtMs: Date.now() - started,
      cancelled,
    };

    this.publish({
      ...snapshot,
      bindIndex,
      ...(cancelled ? {} : { checkResult: result, lastCompletedCheck: result }),
    });
    return result;
  }

  private normalizeUri(uri: string): string {
    return uri.toLowerCase();
  }
}

export type { CachedDocument, FileSymbols };
