import * as vscode from "vscode";
import {
  COMMAND_IDS,
  DIAGNOSTIC_SOURCE,
  DependencyScanner,
  DiagnosticCodes,
  DiagnosticsLinter,
  LANGUAGE_IDS,
  LanguageProcessor,
  PROJECT_CONFIG_FILENAME,
  WorkspaceSymbolIndexer,
  buildMockDocument,
  debounceKeyed,
  extractSuppressedCodes,
  getCoreModulesPath,
  isExcluded,
  isSuppressed,
  isReadOnlyModuleFile,
  logger,
  lookupSystemNamespaceOrClassByName,
  readConfiguration,
  readProjectConfig,
  setDiagnosticPayload,
  LintPipelineProfiler,
  SemanticLintCache,
  resolveLintBatchConcurrency,
  isWorkerPoolLintEnabled,
  runWorkspaceLintWithWorkerPool,
  AnalysisProgram,
  collectUnusedCodeDiagnostics,
  deserializeLintDiagnostics,
  ReachabilityParseCache,
  resolveBuildOptimizationOptions,
  DEFAULT_REACHABILITY_REMOVE_OPTIONS,
  type AnalysisPriority,
  type FileChangeSet,
  type SerializedLintDiagnostic,
  type LintWorkspaceFileInput,
  type ProjectMetadata,
  type ReachabilityModuleInput,
} from "@data7/core";
import type { SharedModuleInfo } from "@data7/core";

import * as path from "path";
import * as fs from "fs";

import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { ExtensionSettingsService } from "./extension-settings-service";

import { WorkspaceFixService } from "./workspace-fix-service";

export interface WorkspaceLintSummary {
  readonly errorCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly fileCount: number;
}

/**
 * Runs validation diagnostics against `.bas` documents. Refresh is debounced
 * per-document so bursts of `onDidChangeTextDocument` events do not trigger
 * repeated disk scans (performance.mdc).
 *
 * Disk-dependent state (shared modules, local modules) is cached per workspace
 * and invalidated only when `data7.json` or the repository contents actually
 * change, keeping the keystroke path cheap.
 */
export class DiagnosticService {
  private static _collection: vscode.DiagnosticCollection | undefined;
  /** Debounce for live typing; save/open use immediate refresh. */
  private static readonly REFRESH_DELAY_MS = 250;
  private static readonly liveDiagnosticUris = new Map<string, vscode.Uri>();
  private static readonly workspaceDiagnosticUris = new Map<string, vscode.Uri>();
  private static readonly pendingDependentUris = new Set<string>();
  /** Scheduling class of files currently being re-linted by propagation. */
  private static readonly dependentPriorities = new Map<string, AnalysisPriority>();
  /** Per-file generation counter — stale lint runs are discarded when the user keeps typing. */
  private static readonly lintGenerations = new Map<string, number>();
  /** Blocks debounced lint until the initial workspace index completes. */
  private static workspaceIndexReady = false;
  private static readonly pendingOpenDocuments = new Set<string>();
  /**
   * Highest document version whose live lint is suppressed after a programmatic
   * edit. Keyed by version rather than by a wall-clock window: a timer either
   * expired early (redundant lint) or swallowed a genuine keystroke.
   */
  private static readonly suppressLiveLintThroughVersions = new Map<string, number>();
  private static dependentPropagationScheduled = false;
  private static readonly pendingDependentTriggers = new Map<string, vscode.Uri>();
  private static pendingDependentForce = false;
  /** Project-wide unused-code diagnostics keyed by uri (lowercase). */
  private static unusedCodeByUri = new Map<string, vscode.Diagnostic[]>();
  private static unusedCodeRefreshScheduled = false;
  private static unusedCodeRefreshRunning = false;
  private static unusedCodeRefreshRequeued = false;

  /** Cache of expensive workspace-level data, keyed by workspaceDir. */
  private static workspaceCache = new Map<string, WorkspaceDiagnosticCache>();
  private static workspaceBasFilesCache: vscode.Uri[] | undefined;

  /** Closed files whose disk content changed and still need a background re-lint. */
  private static readonly backgroundLintQueue = new Map<string, vscode.Uri>();
  private static backgroundLintScheduled = false;
  /** Short: `externalRefreshDebounced` already coalesced the disk events. */
  private static readonly BACKGROUND_LINT_DELAY_MS = 50;

  private static refreshDebounced = debounceKeyed(
    (document: vscode.TextDocument) => {
      DiagnosticService.refreshDiagnosticsNow(document, false);
    },
    DiagnosticService.REFRESH_DELAY_MS,
    (document: vscode.TextDocument) => document.uri.toString().toLowerCase(),
  );

  /**
   * Debounced refresh for external disk changes (file watcher / batch writes).
   * Kept separate from live typing debounce so keystroke lint stays at 250ms
   * while disk events can coalesce briefly without skipping open-buffer edits.
   */
  private static readonly EXTERNAL_REFRESH_DELAY_MS = 200;
  private static externalRefreshDebounced = debounceKeyed(
    (uri: vscode.Uri) => {
      DiagnosticService.refreshFromExternalChange(uri);
    },
    DiagnosticService.EXTERNAL_REFRESH_DELAY_MS,
    (uri: vscode.Uri) => uri.toString().toLowerCase(),
  );

  public static initialize(context: vscode.ExtensionContext): void {
    this._collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
    context.subscriptions.push(this._collection);

    if (process.env["DATA7_LINT_PROFILE"] === "1") {
      LintPipelineProfiler.setEnabled(true);
    }

    context.subscriptions.push(
      vscode.commands.registerCommand("data7.refreshDiagnostics", (uriStr: string) => {
        // In LSP mode the Language Client owns Problems; local refresh would duplicate.
        if (this.languageServerOwnsProblems()) return;
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString().toLowerCase() === uriStr.toLowerCase(),
        );
        if (doc) {
          this.refreshDiagnosticsNow(doc, true);
        }
      }),
    );

    // LSP path (LSP-001): when the flag is on, the LanguageServerService (started
    // from extension.ts) owns publishDiagnostics. Skip local live listeners and
    // keep the local DiagnosticCollection empty so Problems is not duplicated
    // (owner "data7" vs the Language Client's collection). Do not import
    // vscode-languageclient here — it pulls real vscode types that break the
    // in-process test mock.
    if (this.languageServerOwnsProblems()) {
      this.clearAllPublishedDiagnostics();
      logger.info(
        "Linter local em espera: features.diagnostics.useLanguageServer=true (diagnósticos via LSP).",
      );
      return;
    }

    this.registerLocalListeners(context);
  }

  private static registerLocalListeners(context: vscode.ExtensionContext): void {
    const handleDocument = (doc: vscode.TextDocument, reevaluateDependent = false): void => {
      // Skip debounced linting while a batch fix or batch lint is in progress.
      if (WorkspaceFixService.isBatchFixInProgress) return;

      // Linting against a partial index produces phantom missing-import /
      // unknown-type. Queue every path — including save — until the cold index
      // completes (REFACTOR-ANALYSIS-ENGINE.md §7).
      if (!this.workspaceIndexReady) {
        this.pendingOpenDocuments.add(doc.uri.toString().toLowerCase());
        return;
      }

      const uriKey = doc.uri.toString().toLowerCase();
      if (!reevaluateDependent) {
        const suppressedThrough = this.suppressLiveLintThroughVersions.get(uriKey);
        if (suppressedThrough !== undefined) {
          if (doc.version <= suppressedThrough) return;
          // The user typed past the programmatic edit — stop suppressing.
          this.suppressLiveLintThroughVersions.delete(uriKey);
        }
        if (WorkspaceFixService.isWillSaveFixingUri(uriKey)) {
          return;
        }
      }

      if (!this.isLiveDiagnosticDocument(doc)) {
        this.clearDiagnostics(doc.uri);
        return;
      }
      if (!this.isEnabled()) {
        this.clearDiagnostics(doc.uri);
        return;
      }
      if (reevaluateDependent) {
        this.refreshDiagnosticsNow(doc, true);
      } else {
        this.refreshDebounced(doc);
      }
    };

    vscode.workspace.onDidOpenTextDocument(
      (doc) => {
        handleDocument(doc, false);
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidSaveTextDocument(
      (doc) => {
        this.invalidateWorkspaceCacheFor(doc.fileName);
        handleDocument(doc, true);
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        handleDocument(e.document, false);
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidCloseTextDocument(
      (doc) => {
        // Workspace file diagnostics must remain visible even after the file is closed
        if (!vscode.workspace.getWorkspaceFolder(doc.uri)) {
          this.clearDiagnostics(doc.uri);
        }
      },
      null,
      context.subscriptions,
    );

    // Invalidate cached repo scans when the user changes settings or files on disk.
    const cfgWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(DIAGNOSTIC_SOURCE)) {
        this.handleExtensionSettingsChanged();
      }
    });
    context.subscriptions.push(
      ExtensionSettingsService.onDidChange(() => {
        this.handleExtensionSettingsChanged();
      }),
    );
    const jsonWatcher = vscode.workspace.createFileSystemWatcher(`**/${PROJECT_CONFIG_FILENAME}`);
    jsonWatcher.onDidChange((uri) => {
      this.handleProjectConfigChanged(uri);
    });
    jsonWatcher.onDidCreate((uri) => {
      this.handleProjectConfigChanged(uri);
    });
    jsonWatcher.onDidDelete((uri) => {
      this.handleProjectConfigChanged(uri);
    });
    // A check offloaded to the background driver answers with stale diagnostics;
    // this republishes the file once the fresh result lands.
    const unsubscribeChecks = AnalysisProgram.getInstance().onCheckCompleted((uri) => {
      this.republishAfterBackgroundCheck(uri);
    });
    context.subscriptions.push(cfgWatcher, jsonWatcher, { dispose: unsubscribeChecks });
  }

  /**
   * Republishes a document whose diagnostics were served from the stale
   * fallback while the scheduler was still working on it. Only open buffers are
   * refreshed: the batch/from-disk paths own publication for closed files.
   */
  private static republishAfterBackgroundCheck(uri: string): void {
    if (!this.isEnabled()) return;
    const key = uri.toLowerCase();
    const doc = vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString().toLowerCase() === key,
    );
    if (!doc || !this.isLiveDiagnosticDocument(doc)) return;
    // Debounced: `ensureChecked` now hits the fresh cached result, so this pass
    // is a cheap publish rather than another analysis.
    this.refreshDebounced(doc);
  }

  /**
   * Maps a file to its scheduling class (REFACTOR-ANALYSIS-ENGINE.md §8.4) so
   * the driver spends its budget on what the user is actually looking at.
   */
  private static resolveAnalysisPriority(uri: vscode.Uri): AnalysisPriority {
    const key = this.uriKey(uri);
    if (vscode.window.activeTextEditor?.document.uri.toString().toLowerCase() === key) {
      return "active";
    }
    if (
      vscode.window.visibleTextEditors.some(
        (editor) => editor.document.uri.toString().toLowerCase() === key,
      )
    ) {
      return "visible";
    }
    const propagationPriority = this.dependentPriorities.get(key);
    if (propagationPriority !== undefined) {
      return propagationPriority;
    }
    if (vscode.workspace.textDocuments.some((doc) => doc.uri.toString().toLowerCase() === key)) {
      return "open";
    }
    return "background";
  }

  /**
   * `data7.json` carries `exclude`, severity overrides and prune options, so a
   * change invalidates published results — not just the cached module scan.
   */
  private static handleProjectConfigChanged(uri: vscode.Uri): void {
    this.invalidateWorkspaceCacheFor(uri.fsPath);
    // `exclude` changes which files exist for the analysis at all.
    this.invalidateWorkspaceFileList();
    // `diagnosticSeverity` and the prune options change published results, so
    // invalidating only the module scan left the old diagnostics on screen.
    AnalysisProgram.getInstance().invalidateAllChecks();
    this.unusedCodeByUri.clear();
    ReachabilityParseCache.getInstance().clear();
    this.refreshAllActive();
    this.scheduleUnusedCodeRefresh();
  }

  private static handleExtensionSettingsChanged(): void {
    this.workspaceCache.clear();
    // `data7.exclude` participates in the file list filter.
    this.invalidateWorkspaceFileList();
    LanguageProcessor.getInstance().handleConfigurationChanged();
    this.refreshAllActive();
    WorkspaceSymbolIndexer.getInstance()
      .indexWorkspace(vscode.workspace.workspaceFolders)
      .catch((err) => {
        logger.warn(
          `Falha ao reindexar workspace após mudança nas configurações Data7: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  public static getCollection(): vscode.DiagnosticCollection {
    if (!this._collection) {
      throw new Error("DiagnosticService.initialize() não foi chamado.");
    }
    return this._collection;
  }

  /**
   * Deterministic full reset of the analysis engine: drops every cache, clears
   * published Problems, re-indexes the workspace and re-lints. Exists so a
   * corrupted or stuck state never requires reloading the IDE window.
   */
  public static async restartAnalysis(): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Data7: reiniciando análise…",
      },
      async () => {
        this.workspaceIndexReady = false;
        this.pendingDependentUris.clear();
        this.dependentPriorities.clear();
        this.backgroundLintQueue.clear();
        this.pendingOpenDocuments.clear();
        this.lintGenerations.clear();
        this.suppressLiveLintThroughVersions.clear();
        this.dependentPropagationScheduled = false;
        this.pendingDependentTriggers.clear();
        this.pendingDependentForce = false;
        this.unusedCodeRefreshScheduled = false;
        this.workspaceCache.clear();
        this.clearAllPublishedDiagnostics();

        WorkspaceFixService.resetBatchState();
        LanguageProcessor.getInstance().clearCache();
        AnalysisProgram.getInstance().clear();

        const indexer = WorkspaceSymbolIndexer.getInstance();
        indexer.resetIndex();
        try {
          await indexer.indexWorkspace(vscode.workspace.workspaceFolders);
        } catch (err) {
          logger.error("Falha ao reindexar workspace durante o reinício da análise.", err);
        } finally {
          this.markWorkspaceIndexReady();
        }

        if (this.isEnabled() && !this.languageServerOwnsProblems()) {
          this.refreshOpenDocuments();
          this.pruneClosedDiagnostics();
        }
      },
    );
  }

  public static markWorkspaceIndexReady(): void {
    this.workspaceIndexReady = true;
    AnalysisProgram.getInstance().invalidateAllChecks();
    for (const uriKey of this.pendingOpenDocuments) {
      const doc = vscode.workspace.textDocuments.find(
        (candidate) => candidate.uri.toString().toLowerCase() === uriKey,
      );
      if (doc && this.isLiveDiagnosticDocument(doc)) {
        this.refreshDebounced(doc);
      }
    }
    this.pendingOpenDocuments.clear();
  }

  /**
   * Skips the debounced live lint for every revision up to `version`, so the
   * change events produced by a programmatic fix do not schedule a lint that a
   * definitive pass is about to redo. Coordination is by document version, not
   * by clock (REFACTOR-ANALYSIS-ENGINE.md §8.5).
   */
  public static suppressLiveLintThroughVersion(uri: vscode.Uri, version: number): void {
    this.suppressLiveLintThroughVersions.set(uri.toString().toLowerCase(), version);
  }

  public static refreshAllActive(): void {
    this.refreshOpenDocuments();
    this.pruneClosedDiagnostics();
  }

  public static refreshOpenDocuments(): void {
    vscode.workspace.textDocuments.forEach((document) => {
      if (this.isLiveDiagnosticDocument(document)) {
        this.refreshDebounced(document);
      }
    });
  }

  public static clearDiagnostics(uri: vscode.Uri): void {
    const key = this.uriKey(uri);
    this.deleteFromCollection(uri);
    this.liveDiagnosticUris.delete(key);
    this.workspaceDiagnosticUris.delete(key);
    this.unusedCodeByUri.delete(key);
  }

  /**
   * Clears every published diagnostic (live + workspace) so a fresh workspace
   * lint / batch fix cannot leave orphan Problems entries behind.
   */
  public static clearAllPublishedDiagnostics(): void {
    this._collection?.clear();
    this.liveDiagnosticUris.clear();
    this.workspaceDiagnosticUris.clear();
    this.unusedCodeByUri.clear();
  }

  /**
   * Clears published Problems and drops cached check results before a full
   * workspace re-analysis. Does **not** re-parse every file here — that would
   * double the work of the lint pass itself; `ensureParsed` refreshes the
   * index as each file is analyzed.
   */
  public static prepareFreshWorkspaceAnalysis(uris: readonly vscode.Uri[]): void {
    this.clearAllPublishedDiagnostics();
    AnalysisProgram.getInstance().invalidateAllChecks();
    // Drop every semantic/declaration lint cache entry so a workspace pass cannot
    // republish stale results computed before a rules change (F5 without reload
    // still benefits once the host rebundles and this pass runs).
    SemanticLintCache.getInstance().clear();

    const processor = LanguageProcessor.getInstance();
    const indexer = WorkspaceSymbolIndexer.getInstance();
    for (const uri of uris) {
      const uriStr = uri.toString();
      processor.invalidate(uriStr);
      indexer.invalidateFileLintCaches(uriStr);
    }
  }

  /** Persists `.data7/analysis-cache.json` from the in-memory index after a workspace pass. */
  private static persistAnalysisCacheAfterWorkspaceLint(): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    WorkspaceSymbolIndexer.getInstance().persistAnalysisCache(folders);
  }

  /**
   * After a batch fix: clear Problems, invalidate caches, re-index, and re-lint
   * the scanned URIs so dependents and stale entries cannot linger.
   */
  public static async relintAfterBatchFix(uris: readonly vscode.Uri[]): Promise<void> {
    if (!this.isEnabled() || uris.length === 0) return;
    await this.lintWorkspaceUris(uris, false);
  }

  /**
   * Schedules a single-file diagnostic refresh after an on-disk change
   * (FileSystemWatcher, batch fix write). Skips while a batch fix/lint runs
   * and when the open buffer is dirty (editor owns that content).
   */
  public static scheduleExternalFileRefresh(uri: vscode.Uri): void {
    if (WorkspaceFixService.isBatchFixInProgress) return;
    if (uri.scheme !== "file") return;
    this.externalRefreshDebounced(uri);
  }

  public static replaceDiagnosticsFromBatch(
    entries: readonly {
      readonly uri: vscode.Uri;
      readonly diagnostics: readonly vscode.Diagnostic[];
    }[],
  ): void {
    for (const entry of entries) {
      const uriKey = this.uriKey(entry.uri);
      if (entry.diagnostics.length === 0) {
        this.clearDiagnostics(entry.uri);
        continue;
      }

      const isOpen = vscode.workspace.textDocuments.some((doc) => this.uriKey(doc.uri) === uriKey);
      this.publishMergedDiagnostics(
        entry.uri,
        [...entry.diagnostics],
        isOpen ? "live" : "workspace",
      );
    }
  }

  public static pruneClosedDiagnostics(): void {
    const openUris = new Set(
      vscode.workspace.textDocuments
        .filter((document) => this.isLiveDiagnosticDocument(document))
        .map((document) => this.uriKey(document.uri)),
    );
    for (const uriKey of Array.from(this.liveDiagnosticUris.keys())) {
      if (!openUris.has(uriKey)) {
        const uri = this.liveDiagnosticUris.get(uriKey);
        // Do not prune diagnostics for workspace files
        if (uri && !vscode.workspace.getWorkspaceFolder(uri)) {
          this.liveDiagnosticUris.delete(uriKey);
          this.deleteFromCollection(uri);
        }
      }
    }
  }

  /**
   * Public synchronous entry point. Callers that need an immediate refresh
   * (tests, manual triggers) bypass the debounce.
   */
  public static refreshDiagnostics(document: vscode.TextDocument): void {
    this.refreshDiagnosticsNow(document);
  }

  private static refreshDiagnosticsNow(
    document: vscode.TextDocument,
    reevaluateDependent = true,
  ): void {
    if (!this.isLiveDiagnosticDocument(document)) {
      this.clearDiagnostics(document.uri);
      return;
    }
    if (!this.isEnabled()) {
      this.clearDiagnostics(document.uri);
      return;
    }

    // Honour `data7.exclude` — clear any prior diagnostics for the file and bail.
    // `data7_modules/` is no longer in the default exclude (its files must
    // be indexed for type resolution) but we still treat them as read-only
    // and emit no diagnostics on them.
    if (isExcluded(document.fileName) || isReadOnlyModuleFile(document.fileName)) {
      this.clearDiagnostics(document.uri);
      return;
    }

    const paths = ProjectService.findProjectPaths(document.fileName);
    if (!paths) {
      this.clearDiagnostics(document.uri);
      return;
    }

    const uriKey = document.uri.toString().toLowerCase();
    const generation = (this.lintGenerations.get(uriKey) ?? 0) + 1;
    this.lintGenerations.set(uriKey, generation);

    const unsuppressed = this.collectDiagnosticsFromMockDocument(document, generation);
    if (this.lintGenerations.get(uriKey) !== generation) {
      LintPipelineProfiler.recordStaleRun(document.uri.toString());
      return;
    }

    LintPipelineProfiler.measure("publish", document.uri.toString(), () => {
      this.publishMergedDiagnostics(document.uri, unsuppressed, "live");
    });

    // Workspace batch already runs a dedicated unused-code pass at the end;
    // scheduling another mid-batch races with prepareFresh clears.
    if (!WorkspaceFixService.isBatchFixInProgress) {
      this.scheduleUnusedCodeRefresh();
    }

    if (
      reevaluateDependent &&
      !DiagnosticService.pendingDependentUris.has(uriKey) &&
      !WorkspaceFixService.isBatchFixInProgress
    ) {
      DiagnosticService.reevaluateDependentFiles(document.uri);
    }
  }

  /**
   * Reevaluates workspace files that depend on the edited file via the reverse
   * dependency graph (import propagation). Coalesced so rapid saves do not fan
   * out one lint per dependent per save event.
   */
  private static reevaluateDependentFiles(
    triggerUri: vscode.Uri,
    options: { readonly force?: boolean } = {},
  ): void {
    // Every trigger is queued: a single slot meant that saving two files within
    // the coalescing window silently dropped the first one's propagation.
    this.pendingDependentTriggers.set(this.uriKey(triggerUri), triggerUri);
    this.pendingDependentForce = options.force === true || this.pendingDependentForce;
    if (this.dependentPropagationScheduled) {
      return;
    }
    this.dependentPropagationScheduled = true;
    setTimeout(() => {
      this.dependentPropagationScheduled = false;
      const triggers = Array.from(this.pendingDependentTriggers.values());
      const force = this.pendingDependentForce;
      this.pendingDependentTriggers.clear();
      this.pendingDependentForce = false;
      for (const uri of triggers) {
        void this.runDependentPropagation(uri, { force });
      }
    }, 80);
  }

  /**
   * Forces dependent re-lint after a programmatic fix/save. Bypasses the
   * API-fingerprint gate and also refreshes files that still have published
   * Problems (covers qualified access without `Imports` edges). Ordinary
   * saves never take this path — it would re-lint too broadly.
   */
  public static forceDependentReevaluation(triggerUri: vscode.Uri): void {
    this.reevaluateDependentFiles(triggerUri, { force: true });
  }

  private static async runDependentPropagation(
    triggerUri: vscode.Uri,
    options: { readonly force?: boolean } = {},
  ): Promise<void> {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    // Accumulated since the last propagation, not since the last keystroke:
    // editing a public signature and then typing anything else used to reset
    // the gate, so the save never re-linted dependents.
    const changeSet = indexer.takeChangeSet(triggerUri.toString());
    try {
      await this.propagateChangeSet(triggerUri, changeSet, options.force === true);
    } catch (err) {
      // Re-open the delta so the next save retries instead of losing it.
      indexer.restoreChangeSet(changeSet);
      logger.error(`Falha ao propagar mudanças de ${triggerUri.fsPath}:`, err);
    }
  }

  private static async propagateChangeSet(
    triggerUri: vscode.Uri,
    changeSet: FileChangeSet,
    force: boolean,
  ): Promise<void> {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const triggerUriStr = triggerUri.toString();
    const isPrincipal = this.isPrincipalBasUri(triggerUri);

    if (!force && !changeSet.apiChanged) {
      return;
    }

    const extraNamespaces = changeSet.changedNamespaces;
    const dependentKeySet = new Set<string>();

    if (isPrincipal) {
      // Principal symbols are ambient — there is no Imports edge to follow.
      for (const uri of await this.findWorkspaceBasFiles()) {
        if (this.uriKey(uri) === this.uriKey(triggerUri)) continue;
        dependentKeySet.add(uri.toString());
      }
    } else {
      // Transitive: when A's API changes, a file importing a namespace that in
      // turn imports A must be re-linted too, or it keeps showing diagnostics
      // that no longer apply.
      const graphDependents = LintPipelineProfiler.measure(
        "dependent-propagation",
        triggerUriStr,
        () => indexer.getTransitiveDependentFileUris(triggerUriStr, extraNamespaces),
      );
      for (const uriStr of graphDependents) {
        dependentKeySet.add(uriStr);
      }
    }

    // Only on explicit force (e.g. fix-active-file): also refresh files that
    // still show Problems. Never do this on ordinary saves — after a workspace
    // lint every scanned URI is tracked, which would re-lint the whole project.
    if (force) {
      for (const uriStr of this.collectPublishedProblemUriStrings(triggerUri)) {
        dependentKeySet.add(uriStr);
      }
    }

    if (dependentKeySet.size === 0) return;

    LintPipelineProfiler.recordDependentPropagation(dependentKeySet.size);
    LintPipelineProfiler.finalizeFile(triggerUriStr, dependentKeySet.size);

    const dependentUris: vscode.Uri[] = [];
    for (const uriStr of dependentKeySet) {
      try {
        const xUri = vscode.Uri.parse(uriStr);
        if (isExcluded(xUri.fsPath) || isReadOnlyModuleFile(xUri.fsPath)) continue;
        if (!vscode.workspace.getWorkspaceFolder(xUri)) continue;
        dependentUris.push(xUri);
      } catch {
        continue;
      }
    }

    if (dependentUris.length === 0) return;

    // Direct importers are what the user is most likely to look at next; the
    // rest of the closure is speculative and yields to them in the scheduler.
    const directKeys = new Set(
      indexer
        .getDependentFileUris(triggerUriStr, extraNamespaces)
        .map((uriStr) => uriStr.toLowerCase()),
    );

    const program = AnalysisProgram.getInstance();
    const claimedKeys = dependentUris.map((uri) => uri.toString().toLowerCase());
    try {
      for (const uri of dependentUris) {
        const key = uri.toString().toLowerCase();
        this.dependentPriorities.set(key, directKeys.has(key) ? "dependent" : "transitive");
        this.pendingDependentUris.add(uri.toString().toLowerCase());
        LanguageProcessor.getInstance().invalidate(uri.toString());
        program.invalidateCheck(uri.toString());
        indexer.invalidateFileLintCaches(uri.toString());
      }

      const BATCH_SIZE = resolveLintBatchConcurrency();
      for (let i = 0; i < dependentUris.length; i += BATCH_SIZE) {
        const batch = dependentUris.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (uri) => {
            const uriStr = uri.toString().toLowerCase();
            try {
              this.lintFile(uri, false);
            } catch (err) {
              logger.error(`Erro ao reavaliar dependente ${uri.fsPath}:`, err);
            } finally {
              this.pendingDependentUris.delete(uriStr);
            }
          }),
        );
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    } finally {
      // A leaked entry here permanently blocks live lint for that file.
      for (const key of claimedKeys) {
        this.pendingDependentUris.delete(key);
        this.dependentPriorities.delete(key);
      }
    }
  }

  /**
   * URIs that currently have at least one published diagnostic (excludes the
   * trigger). Tracking maps alone are not enough — workspace lint registers
   * every scanned file even when the diagnostic list is empty.
   */
  private static collectPublishedProblemUriStrings(except: vscode.Uri): string[] {
    const exceptKey = this.uriKey(except);
    const result: string[] = [];
    const seen = new Set<string>();

    const consider = (uri: vscode.Uri): void => {
      const key = this.uriKey(uri);
      if (key === exceptKey || seen.has(key)) return;
      const tracked = this.resolveCollectionUri(uri);
      const diags = this._collection?.get(tracked) ?? [];
      if (diags.length === 0) return;
      seen.add(key);
      result.push(uri.toString());
    };

    for (const uri of this.liveDiagnosticUris.values()) {
      consider(uri);
    }
    for (const uri of this.workspaceDiagnosticUris.values()) {
      consider(uri);
    }
    return result;
  }

  private static isPrincipalBasUri(uri: vscode.Uri): boolean {
    return /(?:^|[\\/])principal\.bas$/i.test(uri.fsPath);
  }

  private static validateModuleReference(
    modName: string,
    lineIndex: number,
    charIndex: number,
    diagnostics: vscode.Diagnostic[],
    wsCache: WorkspaceDiagnosticCache,
    isExplicit: boolean,
    documentUri: string,
  ): void {
    if (modName.trim().length === 0) return;

    const lowerModName = modName.toLowerCase();
    if (wsCache.localModules.has(lowerModName)) return;
    if (DependencyScanner.isIgnoredNamespace(lowerModName)) return;
    if (!isExplicit && wsCache.localTypes.has(lowerModName)) return;
    if (!isExplicit) {
      if (lookupSystemNamespaceOrClassByName(modName).length > 0) return;
      const symbol = WorkspaceSymbolIndexer.getInstance().findSymbolByName(modName, documentUri);
      if (symbol && symbol.kind !== "namespace") return;
    }

    const resolvedKey = lowerModName;
    if (!wsCache.sharedModules.has(resolvedKey)) {
      // Distinguish the three scenarios so the message tells the user
      // exactly which action recovers the project state.
      const declared = Object.keys(wsCache.dependencies).some(
        (k) => k.toLowerCase() === lowerModName,
      );
      const message = declared
        ? `Módulo "${modName}" está declarado em data7.json mas não está presente no repositório de módulos da extensão. Importe-o novamente ou ajuste data7.json.`
        : `Módulo "${modName}" não foi encontrado. Implemente-o localmente ou adicione-o ao repositório global de módulos.`;
      const range = new vscode.Range(lineIndex, charIndex, lineIndex, charIndex + modName.length);
      const diag = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      diag.code = DiagnosticCodes.ModuleNotFound;
      setDiagnosticPayload(diag, {
        code: DiagnosticCodes.ModuleNotFound,
        moduleName: modName,
      });
      diagnostics.push(diag);
      return;
    }
    const isDeclared = Object.keys(wsCache.dependencies).some(
      (k) => k.toLowerCase() === resolvedKey,
    );
    if (wsCache.coreModules.has(resolvedKey)) return;
    if (!isDeclared) {
      const range = new vscode.Range(lineIndex, charIndex, lineIndex, charIndex + modName.length);
      const moduleInfo = wsCache.sharedModules.get(resolvedKey);
      const finalModuleName = moduleInfo?.moduleName ?? modName;
      const diag = new vscode.Diagnostic(
        range,
        `Módulo "${finalModuleName}" está disponível globalmente, mas não está declarado nas dependências do projeto. Use a opção de instalação rápida.`,
        vscode.DiagnosticSeverity.Error,
      );
      diag.code = DiagnosticCodes.ModuleNotDeclared;
      setDiagnosticPayload(diag, {
        code: DiagnosticCodes.ModuleNotDeclared,
        moduleName: finalModuleName,
      });
      diagnostics.push(diag);
    }
  }

  /**
   * Returns a cached snapshot of the disk-dependent data needed by the linter.
   * Cache lives until invalidation by configuration change, `data7.json` change,
   * or repository import.
   */
  private static getWorkspaceCache(workspaceDir: string): WorkspaceDiagnosticCache {
    const cached = this.workspaceCache.get(workspaceDir);
    if (cached) return cached;

    let dependencies: Record<string, string> = {};
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    try {
      const cfg = readProjectConfig(configJsonPath);
      if (cfg) dependencies = { ...cfg.dependencies };
    } catch (err) {
      logger.warn(
        `Falha ao ler data7.json em ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
    const coreModules = DependencyScanner.scanSharedModules(getCoreModulesPath());
    for (const [key, info] of coreModules.entries()) {
      sharedModules.set(key, info);
    }

    const srcDir = path.join(workspaceDir, "src");
    const localModules = DependencyScanner.getLocalModuleNames(srcDir);
    const localTypes = DependencyScanner.getLocalTypeNames(srcDir);
    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    // Modules installed under data7_modules/ are valid local references: add
    // their declared namespaces to localModules so validateModuleReference does
    // not flag them as module-not-found.
    for (const modName of DependencyScanner.getLocalModuleNames(data7ModulesDir)) {
      localModules.add(modName);
    }
    for (const typeName of DependencyScanner.getLocalTypeNames(data7ModulesDir)) {
      localTypes.add(typeName);
    }

    const snapshot: WorkspaceDiagnosticCache = {
      dependencies,
      sharedModules,
      coreModules,
      localModules,
      localTypes,
    };
    this.workspaceCache.set(workspaceDir, snapshot);
    return snapshot;
  }

  /**
   * Drops cached scans for any workspace that contains the given file path.
   * Called when `data7.json`, a `.bas` file, or the configuration changes.
   */
  public static invalidateWorkspaceCacheFor(filePath: string): void {
    for (const workspaceDir of Array.from(this.workspaceCache.keys())) {
      if (filePath.toLowerCase().startsWith(workspaceDir.toLowerCase())) {
        this.workspaceCache.delete(workspaceDir);
      }
    }
  }

  /**
   * Workspace `.bas`/`.d7b` files. The glob result is cached because the
   * project-wide `unused-code` pass asks for it on a typing debounce; the cache
   * is dropped by {@link invalidateWorkspaceFileList} whenever a file is
   * created or deleted, or when `data7.exclude` changes.
   */
  public static async findWorkspaceBasFiles(workspaceDir?: string): Promise<vscode.Uri[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [];
    }

    let uris = this.workspaceBasFilesCache;
    if (!uris) {
      const found = await vscode.workspace.findFiles("**/*.{bas,d7b}");
      uris = found.filter((uri) => {
        const fsPath = uri.fsPath;
        return uri.scheme === "file" && !isExcluded(fsPath) && !isReadOnlyModuleFile(fsPath);
      });
      this.workspaceBasFilesCache = uris;
    }

    if (!workspaceDir) return [...uris];
    return uris.filter((uri) => this.isPathInsideWorkspace(uri.fsPath, workspaceDir));
  }

  /** Drops the cached workspace file list after a create/delete/settings change. */
  public static invalidateWorkspaceFileList(): void {
    this.workspaceBasFilesCache = undefined;
  }

  public static lintFile(uri: vscode.Uri, reevaluateDependent = true): vscode.Diagnostic[] {
    if (uri.scheme !== "file") {
      this.clearDiagnostics(uri);
      return [];
    }
    // If the document is already open in the editor, use the live buffer.
    const existingDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
    );
    if (existingDoc) {
      const diags = this.collectDiagnosticsFromMockDocument(existingDoc);
      this.publishMergedDiagnostics(existingDoc.uri, diags, "live");
      if (reevaluateDependent && !WorkspaceFixService.isBatchFixInProgress) {
        DiagnosticService.reevaluateDependentFiles(existingDoc.uri);
      }
      return diags;
    }
    // Otherwise lint from disk without opening an editor tab.
    const diags = this.lintFileFromDisk(uri);
    this.publishMergedDiagnostics(uri, diags, "workspace");
    return diags;
  }

  public static async lintWorkspace(showNotification = false): Promise<void> {
    if (!this.isEnabled()) {
      if (showNotification) {
        vscode.window.showWarningMessage(
          "O linter Data7 está desativado em data7.features.diagnostics.enabled.",
        );
      }
      return;
    }

    // Workspace publish must not compete with the Language Client collection.
    // Fase 5 of LSP-001 will own workspace lint via the protocol; until then,
    // open-document diagnostics come only from `@data7/lsp`.
    if (this.languageServerOwnsProblems()) {
      this.clearAllPublishedDiagnostics();
      if (showNotification) {
        vscode.window.showInformationMessage(
          "Com features.diagnostics.useLanguageServer ativo, os diagnósticos vêm do Language Server (arquivos abertos). O painel Problems local não é preenchido pelo linter de workspace.",
        );
      }
      return;
    }

    const uris = await this.findWorkspaceBasFiles();
    if (uris.length === 0) {
      if (showNotification) {
        vscode.window.showInformationMessage(
          "Nenhum arquivo Data7 Basic (.bas, .d7b) encontrado para analisar.",
        );
      }
      return;
    }

    const summary = await this.lintWorkspaceUris(uris, true);

    if (showNotification) {
      const totalIssues = summary.errorCount + summary.warningCount + summary.infoCount;
      let msg = "";
      if (totalIssues === 0) {
        msg = "Linter concluído: Nenhum problema encontrado no projeto.";
      } else {
        msg = `Linter concluído: ${summary.errorCount} erro(s), ${summary.warningCount} aviso(s) e ${summary.infoCount} informação(ões) no projeto.`;
        void vscode.commands.executeCommand("workbench.actions.view.problems");
      }

      const actions =
        totalIssues > 0
          ? ["Corrigir Tudo (Ajuste em Massa)", "Reiniciar Linter"]
          : ["Reiniciar Linter"];
      vscode.window.showInformationMessage(msg, ...actions).then(async (selection) => {
        if (selection === "Corrigir Tudo (Ajuste em Massa)") {
          await vscode.commands.executeCommand(COMMAND_IDS.fixAllWorkspace);
        } else if (selection === "Reiniciar Linter") {
          await vscode.commands.executeCommand(COMMAND_IDS.runLinter);
        }
      });
    }
  }

  public static async lintWorkspaceForRun(workspaceDir: string): Promise<WorkspaceLintSummary> {
    if (!this.isEnabled()) {
      return { errorCount: 0, warningCount: 0, infoCount: 0, fileCount: 0 };
    }

    const uris = await this.findWorkspaceBasFiles(workspaceDir);
    if (uris.length === 0) {
      return { errorCount: 0, warningCount: 0, infoCount: 0, fileCount: 0 };
    }

    return this.lintWorkspaceUris(uris, false);
  }

  private static async lintWorkspaceUris(
    uris: readonly vscode.Uri[],
    showProgress: boolean,
  ): Promise<WorkspaceLintSummary> {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    this.prepareFreshWorkspaceAnalysis(uris);

    const openUris: vscode.Uri[] = [];
    const diskUris: vscode.Uri[] = [];
    for (const uri of uris) {
      const isOpen = vscode.workspace.textDocuments.some(
        (doc) => doc.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
      );
      if (isOpen) {
        openUris.push(uri);
      } else {
        diskUris.push(uri);
      }
    }

    const useWorkerPool = isWorkerPoolLintEnabled() && diskUris.length > 0;

    const countDiagnostics = (diags: readonly vscode.Diagnostic[]): void => {
      for (const diag of diags) {
        if (diag.severity === vscode.DiagnosticSeverity.Error) {
          errorCount++;
        } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
          warningCount++;
        } else {
          infoCount++;
        }
      }
    };

    const run = async (
      progress?: { report(value: { message?: string; increment?: number }): void },
      token?: { readonly isCancellationRequested: boolean },
    ): Promise<void> => {
      if (useWorkerPool) {
        progress?.report({ message: "Analisando arquivos fechados (worker threads)..." });
        const workerCounts = await this.lintDiskUrisWithWorkerPool(diskUris, token);
        errorCount += workerCounts.errorCount;
        warningCount += workerCounts.warningCount;
        infoCount += workerCounts.infoCount;

        const BATCH_SIZE = resolveLintBatchConcurrency();
        for (let i = 0; i < openUris.length; i += BATCH_SIZE) {
          if (token?.isCancellationRequested) break;
          const batch = openUris.slice(i, i + BATCH_SIZE);
          progress?.report({
            message: `${i + 1}/${openUris.length} — Arquivos abertos...`,
            increment: openUris.length > 0 ? (batch.length / openUris.length) * 100 : 0,
          });
          await Promise.all(
            batch.map(async (uri) => {
              try {
                const diags = await this.lintUriForBatch(uri);
                countDiagnostics(diags);
              } catch (err) {
                logger.error(`Erro ao analisar arquivo ${uri.fsPath} no linter:`, err);
              }
            }),
          );
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
        return;
      }

      const BATCH_SIZE = resolveLintBatchConcurrency();
      for (let i = 0; i < uris.length; i += BATCH_SIZE) {
        if (token?.isCancellationRequested) break;

        const batch = uris.slice(i, i + BATCH_SIZE);
        progress?.report({
          message: `${i + 1}/${uris.length} — Processando lote de arquivos...`,
          increment: (batch.length / uris.length) * 100,
        });

        await Promise.all(
          batch.map(async (uri) => {
            try {
              const diags = await this.lintUriForBatch(uri);
              countDiagnostics(diags);
            } catch (err) {
              logger.error(`Erro ao analisar arquivo ${uri.fsPath} no linter:`, err);
            }
          }),
        );

        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    };

    WorkspaceFixService.isBatchFixInProgress = true;
    try {
      await AnalysisProgram.getInstance().runWithForcedSyncChecksAsync(async () => {
        if (showProgress) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Analisando projeto com o linter...",
              cancellable: true,
            },
            async (progress, token) => {
              await run(progress, token);
            },
          );
        } else {
          await run();
        }
      });
    } finally {
      WorkspaceFixService.isBatchFixInProgress = false;
    }

    await this.refreshUnusedCodeDiagnostics(uris);
    this.persistAnalysisCacheAfterWorkspaceLint();

    return { errorCount, warningCount, infoCount, fileCount: uris.length };
  }

  private static async lintUriForBatch(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
    );
    // Always publish the diagnostics we just computed. Re-reading the collection
    // by a differently-cased Uri previously counted errors that never stayed in
    // Problems (`get(uri)` returned undefined while `?? merged` still counted).
    if (openDoc) {
      const diags = this.collectDiagnosticsFromMockDocument(openDoc);
      this.publishMergedDiagnostics(openDoc.uri, diags, "workspace");
      return diags;
    }

    const diags = await this.lintFileFromDiskAsync(uri);
    this.publishMergedDiagnostics(uri, diags, "workspace");
    return diags;
  }

  private static async lintDiskUrisWithWorkerPool(
    diskUris: readonly vscode.Uri[],
    token?: { readonly isCancellationRequested: boolean },
  ): Promise<Pick<WorkspaceLintSummary, "errorCount" | "warningCount" | "infoCount">> {
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;

    const indexer = WorkspaceSymbolIndexer.getInstance();
    const inputs: LintWorkspaceFileInput[] = [];
    const preambleByUri = new Map<string, vscode.Diagnostic[]>();

    const BATCH_SIZE = resolveLintBatchConcurrency();
    for (let i = 0; i < diskUris.length; i += BATCH_SIZE) {
      if (token?.isCancellationRequested) break;
      const batch = diskUris.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (uri) => {
          let content: string;
          try {
            content = await fs.promises.readFile(uri.fsPath, "utf-8");
          } catch (err) {
            logger.warn(
              `Falha ao ler ${uri.fsPath} para lint worker: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            return;
          }
          const mockDoc = buildMockDocument(uri, content);
          // ensureParsed during preamble refreshes host index for this file.
          preambleByUri.set(uri.toString(), this.collectPreambleDiagnostics(mockDoc));
          inputs.push({
            uri: uri.toString(),
            filePath: uri.fsPath,
            content,
          });
        }),
      );
    }

    if (token?.isCancellationRequested || inputs.length === 0) {
      return { errorCount, warningCount, infoCount };
    }

    // Export AFTER preamble so every disk file's symbols are in the worker snapshot.
    const snapshot = indexer.exportLintSnapshot();
    const workerResult = await runWorkspaceLintWithWorkerPool(inputs, snapshot);

    for (const uri of diskUris) {
      const uriStr = uri.toString();
      const preamble = preambleByUri.get(uriStr) ?? [];
      // Workers may echo a differently-cased URI; match case-insensitively.
      const advancedSerialized =
        workerResult.diagnosticsByUri.get(uriStr) ??
        [...workerResult.diagnosticsByUri.entries()].find(
          ([key]) => key.toLowerCase() === uriStr.toLowerCase(),
        )?.[1] ??
        [];
      const advanced = this.deserializeWorkerDiagnostics(advancedSerialized);
      const merged = [...preamble, ...advanced];
      this.publishMergedDiagnostics(uri, merged, "workspace");
      for (const diag of merged) {
        if (diag.severity === vscode.DiagnosticSeverity.Error) {
          errorCount++;
        } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
          warningCount++;
        } else {
          infoCount++;
        }
      }
    }

    return { errorCount, warningCount, infoCount };
  }

  /**
   * Lints a file by reading its content from disk (no editor open), builds a
   * mock TextDocument, and runs the full diagnostics pipeline. Returns the
   * collected diagnostics without publishing them to the collection.
   *
   * Callers are responsible for publishing to `this._collection` if desired.
   */
  private static lintFileFromDisk(uri: vscode.Uri): vscode.Diagnostic[] {
    const fsPath = uri.fsPath;
    let content: string;
    try {
      content = fs.readFileSync(fsPath, "utf-8");
    } catch (err) {
      logger.warn(
        `Falha ao ler ${fsPath} para linting: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }

    const mockDoc = buildMockDocument(uri, content);
    return this.collectDiagnosticsFromMockDocument(mockDoc);
  }

  private static async lintFileFromDiskAsync(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    const fsPath = uri.fsPath;
    let content: string;
    try {
      content = await fs.promises.readFile(fsPath, "utf-8");
    } catch (err) {
      logger.warn(
        `Falha ao ler ${fsPath} para linting assíncrono: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }

    const mockDoc = buildMockDocument(uri, content);
    return this.collectDiagnosticsFromMockDocument(mockDoc);
  }

  /**
   * Parse, index, module-reference and syntax diagnostics — shared by live lint,
   * batch-from-disk, and worker-pool merge paths.
   */
  private static collectPreambleDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
    const uriStr = document.uri.toString();
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const paths = ProjectService.findProjectPaths(document.fileName);
    if (!paths) return [];

    let cachedDoc: ReturnType<LanguageProcessor["getOrParse"]>;
    try {
      cachedDoc = LintPipelineProfiler.measure("parse", uriStr, () => {
        const snapshot = AnalysisProgram.getInstance().ensureParsed(uriStr, text, document.version);
        return {
          uri: snapshot.uri,
          unit: snapshot.unit,
          tokens: snapshot.tokens,
          errors: snapshot.errors,
          version: snapshot.version,
          content: snapshot.content,
        };
      });
    } catch (err) {
      logger.error("Falha ao obter AST do LanguageProcessor.", err);
      return [];
    }

    if (vscode.workspace.getWorkspaceFolder(document.uri)) {
      LintPipelineProfiler.measure("index-update", uriStr, () => {
        // AnalysisProgram.ensureParsed already updated the indexer via parseFromAst.
      });
    }

    const wsCache = this.getWorkspaceCache(paths.workspaceDir);
    const suppressions = extractSuppressedCodes(text);

    LintPipelineProfiler.measure("module-refs", uriStr, () => {
      try {
        for (const reference of DependencyScanner.collectModuleReferencesFromUnit(cachedDoc.unit)) {
          const namespace = reference.isExplicit
            ? (reference.name.split(".")[0] ?? reference.name)
            : reference.name;
          this.validateModuleReference(
            namespace,
            reference.loc?.line ?? 0,
            reference.loc?.character ?? 0,
            diagnostics,
            wsCache,
            reference.isExplicit,
            uriStr,
          );
        }
      } catch (err: unknown) {
        logger.error("Falha ao coletar referências de módulos via AST.", err);
      }
    });

    cachedDoc.errors.forEach((err) => {
      const line = Math.max(0, err.loc.line - 1);
      const col = Math.max(0, err.loc.column);
      const range = new vscode.Range(line, col, line, col + 1);
      const isMissingThen =
        err.code === "expected-token" && err.message.toLowerCase().includes("expected 'then'");
      const severity = isMissingThen
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
      const diag = new vscode.Diagnostic(range, err.message, severity);
      diag.code = err.code;
      diag.source = DIAGNOSTIC_SOURCE;
      diagnostics.push(diag);
    });

    return diagnostics.filter((diag) => {
      const rawCode = diag.code;
      let codeStr: string;
      if (typeof rawCode === "string") {
        codeStr = rawCode;
      } else if (typeof rawCode === "number") {
        codeStr = String(rawCode);
      } else if (rawCode && typeof rawCode === "object" && "value" in rawCode) {
        codeStr = String(rawCode.value);
      } else {
        codeStr = "";
      }
      return !isSuppressed(suppressions, diag.range.start.line, codeStr);
    });
  }

  /**
   * Runs the full diagnostics pipeline on a mock (or real) document object.
   * Extracted from `refreshDiagnosticsNow` so both the live editor path and
   * the batch-from-disk path share identical logic.
   */
  private static collectDiagnosticsFromMockDocument(
    document: vscode.TextDocument,
    expectedGeneration?: number,
  ): vscode.Diagnostic[] {
    const uriKey = document.uri.toString().toLowerCase();
    const uriStr = document.uri.toString();

    const isStale = (): boolean =>
      expectedGeneration !== undefined && this.lintGenerations.get(uriKey) !== expectedGeneration;

    const unsuppressed = this.collectPreambleDiagnostics(document);
    if (isStale()) return [];

    try {
      const cancelToken = {
        get isCancellationRequested(): boolean {
          return isStale();
        },
      };
      const advanced = LintPipelineProfiler.measure("advanced-lint", uriStr, () => {
        const check = AnalysisProgram.getInstance().ensureChecked(
          uriStr,
          document.getText(),
          document.version,
          cancelToken,
          this.resolveAnalysisPriority(document.uri),
        );
        return [...check.diagnostics];
      });
      unsuppressed.push(...advanced);
    } catch (err: unknown) {
      logger.error("Falha ao executar diagnósticos avançados.", err);
    }

    return unsuppressed;
  }

  /** Test-only hook: clears all cached state. */
  public static __resetForTests(): void {
    this.workspaceCache.clear();
    this.liveDiagnosticUris.clear();
    this.workspaceDiagnosticUris.clear();
    this.pendingDependentUris.clear();
    this.dependentPriorities.clear();
    this.backgroundLintQueue.clear();
    this.backgroundLintScheduled = false;
    this.lintGenerations.clear();
    this.workspaceIndexReady = false;
    this.pendingOpenDocuments.clear();
    this.suppressLiveLintThroughVersions.clear();
    this.dependentPropagationScheduled = false;
    this.pendingDependentTriggers.clear();
    this.pendingDependentForce = false;
    this.refreshDebounced.cancelAll();
    this.externalRefreshDebounced.cancelAll();
    SemanticLintCache.resetForTests();
  }

  private static uriKey(uri: vscode.Uri): string {
    return uri.toString().toLowerCase();
  }

  /**
   * Prefer the Uri object already stored in the collection maps so
   * `DiagnosticCollection.set/delete` hit the same key VS Code indexed.
   * Windows path casing otherwise leaves orphan Problem entries.
   */
  private static resolveCollectionUri(uri: vscode.Uri): vscode.Uri {
    const key = this.uriKey(uri);
    return this.liveDiagnosticUris.get(key) ?? this.workspaceDiagnosticUris.get(key) ?? uri;
  }

  private static deleteFromCollection(uri: vscode.Uri): void {
    const tracked = this.resolveCollectionUri(uri);
    this._collection?.delete(tracked);
    if (tracked.toString() !== uri.toString()) {
      this._collection?.delete(uri);
    }
  }

  private static refreshFromExternalChange(uri: vscode.Uri): void {
    if (WorkspaceFixService.isBatchFixInProgress) return;
    if (!this.isEnabled()) return;
    if (uri.scheme !== "file") return;
    if (isExcluded(uri.fsPath) || isReadOnlyModuleFile(uri.fsPath)) {
      this.clearDiagnostics(uri);
      return;
    }

    const openDoc = vscode.workspace.textDocuments.find(
      (doc) => this.uriKey(doc.uri) === this.uriKey(uri),
    );
    if (openDoc?.isDirty) return;

    if (openDoc) {
      this.refreshDiagnosticsNow(openDoc, true);
      return;
    }

    // Closed files used to be re-linted only when they already had published
    // Problems, so a file that *became* invalid on disk stayed silent until it
    // was opened. Every change is now analyzed, but in the background lane so
    // bulk disk churn (a git checkout) never blocks the editor.
    this.enqueueBackgroundLint(uri);
  }

  /**
   * Background lane for disk-driven re-lints of closed files. Deliberately
   * separate from the AST check scheduler: those files have no snapshot yet, so
   * the work starts at a disk read rather than at a cached parse.
   */
  private static enqueueBackgroundLint(uri: vscode.Uri): void {
    this.backgroundLintQueue.set(this.uriKey(uri), uri);
    if (this.backgroundLintScheduled) return;
    this.backgroundLintScheduled = true;
    setTimeout(() => {
      this.backgroundLintScheduled = false;
      void this.drainBackgroundLintQueue();
    }, this.BACKGROUND_LINT_DELAY_MS);
  }

  private static async drainBackgroundLintQueue(): Promise<void> {
    const batchSize = resolveLintBatchConcurrency();
    while (this.backgroundLintQueue.size > 0) {
      if (WorkspaceFixService.isBatchFixInProgress) {
        this.backgroundLintQueue.clear();
        return;
      }
      const batch = Array.from(this.backgroundLintQueue.entries()).slice(0, batchSize);
      for (const [key, uri] of batch) {
        this.backgroundLintQueue.delete(key);
        try {
          const diagnostics = await this.lintFileFromDiskAsync(uri);
          this.publishMergedDiagnostics(uri, diagnostics, "workspace");
        } catch (err) {
          logger.warn(
            `Falha ao reanalisar ${uri.fsPath} após mudança em disco: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
      // Yield so a burst of file events cannot monopolize the extension host.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  /**
   * Delegates to the shared transfer helper so worker-produced diagnostics keep
   * their `data` payload, tags and related information — without those, quick
   * fixes silently disappear on files linted by the worker pool.
   */
  private static deserializeWorkerDiagnostics(
    diagnostics: readonly SerializedLintDiagnostic[],
  ): vscode.Diagnostic[] {
    return deserializeLintDiagnostics(
      diagnostics,
      vscode as unknown as Parameters<typeof deserializeLintDiagnostics>[1],
    ) as unknown as vscode.Diagnostic[];
  }

  private static isEnabled(): boolean {
    return readConfiguration().features.diagnostics.enabled;
  }

  /**
   * When `features.diagnostics.useLanguageServer` is on, `@data7/lsp` (via the
   * Language Client) is the sole publisher for the Problems panel. The local
   * `DiagnosticCollection("data7")` must stay empty — otherwise every open
   * document appears twice (owners `data7` and `_generated_diagnostic_collection_name_#0`).
   */
  private static languageServerOwnsProblems(): boolean {
    return readConfiguration().features.diagnostics.useLanguageServer === true;
  }

  private static isLiveDiagnosticDocument(document: vscode.TextDocument): boolean {
    return (
      document.uri.scheme === "file" &&
      (document.languageId === LANGUAGE_IDS.d7basic || document.fileName.endsWith(".bas")) &&
      fs.existsSync(document.uri.fsPath)
    );
  }

  private static isPathInsideWorkspace(fsPath: string, workspaceDir: string): boolean {
    const resolvedPath = path.resolve(fsPath).toLowerCase();
    const resolvedWorkspace = path.resolve(workspaceDir).toLowerCase();
    return (
      resolvedPath === resolvedWorkspace ||
      resolvedPath.startsWith(resolvedWorkspace + path.sep.toLowerCase())
    );
  }

  /**
   * Publishes file diagnostics merged with any project-wide unused-code hits.
   */
  private static publishMergedDiagnostics(
    uri: vscode.Uri,
    baseDiags: readonly vscode.Diagnostic[],
    origin: "live" | "workspace",
  ): void {
    // Gate every publish path (live, workspace batch, worker, F5 pre-run) so LSP
    // mode cannot leave a second owner in Problems.
    if (this.languageServerOwnsProblems()) {
      this.clearDiagnostics(uri);
      return;
    }

    const key = this.uriKey(uri);
    const previous = this.liveDiagnosticUris.get(key) ?? this.workspaceDiagnosticUris.get(key);
    // Keep a stable Uri identity for DiagnosticCollection across live/workspace publishes.
    const canonical = previous ?? uri;
    if (previous && previous.toString() !== uri.toString()) {
      this._collection?.delete(uri);
    }

    const withoutUnusedCode = baseDiags.filter((d) => d.code !== DiagnosticCodes.UnusedCode);
    const unusedCode = this.unusedCodeByUri.get(key) ?? [];
    this._collection?.set(canonical, [...withoutUnusedCode, ...unusedCode]);
    if (origin === "live") {
      this.liveDiagnosticUris.set(key, canonical);
      this.workspaceDiagnosticUris.delete(key);
    } else {
      this.workspaceDiagnosticUris.set(key, canonical);
      this.liveDiagnosticUris.delete(key);
    }
  }

  /**
   * Coalesces the project-wide `unused-code` pass. The scheduled flag alone
   * only guarded queueing, so a pass starting while another was still awaiting
   * disk I/O produced overlapping full-project analyses; `unusedCodeRefreshRunning`
   * guards the execution and re-queues instead of running concurrently.
   */
  private static scheduleUnusedCodeRefresh(): void {
    if (this.unusedCodeRefreshScheduled) return;
    this.unusedCodeRefreshScheduled = true;
    setTimeout(() => {
      this.unusedCodeRefreshScheduled = false;
      if (this.unusedCodeRefreshRunning) {
        this.unusedCodeRefreshRequeued = true;
        return;
      }
      void this.runUnusedCodeRefresh();
    }, 600);
  }

  private static async runUnusedCodeRefresh(): Promise<void> {
    this.unusedCodeRefreshRunning = true;
    try {
      await this.refreshUnusedCodeDiagnostics();
    } catch (err) {
      logger.error("Falha ao atualizar diagnósticos unused-code.", err);
    } finally {
      this.unusedCodeRefreshRunning = false;
    }

    if (this.unusedCodeRefreshRequeued) {
      this.unusedCodeRefreshRequeued = false;
      this.scheduleUnusedCodeRefresh();
    }
  }

  /**
   * Recomputes declaration reachability for the workspace and overlays
   * Recomputes declaration reachability for the workspace and overlays
   * `unused-code` hints without wiping per-file lint results.
   */
  private static async refreshUnusedCodeDiagnostics(uris?: readonly vscode.Uri[]): Promise<void> {
    if (!this.isEnabled()) return;

    const basUris = uris ?? (await this.findWorkspaceBasFiles());
    if (basUris.length === 0) {
      this.republishUnusedCodeMap(new Map());
      return;
    }

    const byWorkspace = new Map<string, vscode.Uri[]>();
    for (const uri of basUris) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder) continue;
      const workspaceDir = folder.uri.fsPath;
      const list = byWorkspace.get(workspaceDir) ?? [];
      list.push(uri);
      byWorkspace.set(workspaceDir, list);
    }

    // Multi-root: also cover files found without an open folder match via path roots.
    if (byWorkspace.size === 0) {
      for (const uri of basUris) {
        const paths = ProjectService.findProjectPaths(uri.fsPath);
        if (!paths) continue;
        const list = byWorkspace.get(paths.workspaceDir) ?? [];
        list.push(uri);
        byWorkspace.set(paths.workspaceDir, list);
      }
    }

    const nextMap = new Map<string, vscode.Diagnostic[]>();

    for (const [workspaceDir, workspaceUris] of byWorkspace) {
      const modules = await this.collectReachabilityModules(workspaceUris);
      if (modules.length === 0) continue;

      const options = this.resolveReachabilityOptions(workspaceDir);
      const hits = collectUnusedCodeDiagnostics(modules, options);

      const moduleByUri = new Map(modules.map((m) => [m.fileUri.toLowerCase(), m]));
      for (const hit of hits) {
        const key = hit.fileUri.toLowerCase();
        const module = moduleByUri.get(key);
        const filtered = module
          ? this.filterSuppressedDiagnostics(module.code, [hit.diagnostic])
          : [hit.diagnostic];
        if (filtered.length === 0) continue;
        const list = nextMap.get(key) ?? [];
        list.push(...filtered);
        nextMap.set(key, list);
      }
    }

    // Bounds the memoized parses to the files still in the project.
    ReachabilityParseCache.getInstance().retainOnly(basUris.map((uri) => uri.toString()));

    this.republishUnusedCodeMap(nextMap);
  }

  private static republishUnusedCodeMap(nextMap: Map<string, vscode.Diagnostic[]>): void {
    const previousKeys = [...this.unusedCodeByUri.keys()];
    this.unusedCodeByUri = nextMap;
    const allKeys = new Set([...previousKeys, ...nextMap.keys()]);

    for (const key of allKeys) {
      const tracked = this.liveDiagnosticUris.get(key) ?? this.workspaceDiagnosticUris.get(key);
      let uri = tracked;
      if (!uri) {
        try {
          uri = vscode.Uri.parse(key);
        } catch {
          continue;
        }
      }
      const collectionUri = tracked ?? uri;
      const existing = this._collection?.get(collectionUri) ?? [];
      const base = existing.filter((d) => d.code !== DiagnosticCodes.UnusedCode);
      const unusedCode = nextMap.get(key) ?? [];
      if (base.length === 0 && unusedCode.length === 0) {
        this.deleteFromCollection(collectionUri);
        continue;
      }
      this._collection?.set(collectionUri, [...base, ...unusedCode]);
      if (!tracked) {
        this.workspaceDiagnosticUris.set(key, collectionUri);
      }
    }
  }

  private static resolveReachabilityOptions(workspaceDir: string): {
    alwaysInclude: readonly string[];
    remove: typeof DEFAULT_REACHABILITY_REMOVE_OPTIONS;
  } {
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    try {
      const cfg = readProjectConfig(configJsonPath);
      if (cfg) {
        const metadata = cfg.raw as unknown as ProjectMetadata;
        const resolved = resolveBuildOptimizationOptions(metadata);
        return {
          alwaysInclude: resolved.prune.alwaysInclude,
          remove: resolved.prune.remove,
        };
      }
    } catch (err) {
      logger.warn(
        `Falha ao resolver prune options em ${workspaceDir}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return {
      alwaysInclude: [],
      remove: DEFAULT_REACHABILITY_REMOVE_OPTIONS,
    };
  }

  private static async collectReachabilityModules(
    uris: readonly vscode.Uri[],
  ): Promise<ReachabilityModuleInput[]> {
    const modules: ReachabilityModuleInput[] = [];
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const openDocsByKey = new Map(
      vscode.workspace.textDocuments.map((d) => [d.uri.toString().toLowerCase(), d]),
    );

    for (const uri of uris) {
      const openDoc = openDocsByKey.get(uri.toString().toLowerCase());
      let code: string;
      if (openDoc) {
        code = openDoc.getText();
      } else {
        // The index already holds the file's content; re-reading every module
        // from disk on each debounced pass was pure overhead.
        const indexed = indexer.getFileSymbols(uri.toString());
        if (indexed) {
          code = indexed.content;
        } else {
          try {
            code = await fs.promises.readFile(uri.fsPath, "utf-8");
          } catch (err) {
            logger.warn(
              `Falha ao ler ${uri.fsPath} para reachability: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            continue;
          }
        }
      }
      const base = path.basename(uri.fsPath);
      const moduleName = base.replace(/\.(bas|d7b)$/i, "");
      modules.push({
        moduleName,
        fileUri: uri.toString(),
        code,
      });
    }
    return modules;
  }

  private static filterSuppressedDiagnostics(
    text: string,
    diagnostics: readonly vscode.Diagnostic[],
  ): vscode.Diagnostic[] {
    const suppressed = extractSuppressedCodes(text);
    return diagnostics.filter((diag) => {
      const code = typeof diag.code === "string" ? diag.code : undefined;
      if (!code) return true;
      return !isSuppressed(suppressed, diag.range.start.line, code);
    });
  }
}

interface WorkspaceDiagnosticCache {
  dependencies: Record<string, string>;
  sharedModules: Map<string, SharedModuleInfo>;
  coreModules: Map<string, SharedModuleInfo>;
  localModules: Set<string>;
  localTypes: Set<string>;
}
