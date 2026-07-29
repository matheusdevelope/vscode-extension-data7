import * as vscode from "vscode";
import {
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
  resolveBuildOptimizationOptions,
  DEFAULT_REACHABILITY_REMOVE_OPTIONS,
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
  /** Per-file generation counter — stale lint runs are discarded when the user keeps typing. */
  private static readonly lintGenerations = new Map<string, number>();
  /** Blocks debounced lint until the initial workspace index completes. */
  private static workspaceIndexReady = false;
  private static readonly pendingOpenDocuments = new Set<string>();
  /** Suppresses redundant live refresh after programmatic save/fix. */
  private static readonly suppressLiveLintUntil = new Map<string, number>();
  private static dependentPropagationScheduled = false;
  private static pendingDependentTriggerUri: vscode.Uri | undefined;
  /** Project-wide unused-code diagnostics keyed by uri (lowercase). */
  private static unusedCodeByUri = new Map<string, vscode.Diagnostic[]>();
  private static unusedCodeRefreshScheduled = false;

  /** Cache of expensive workspace-level data, keyed by workspaceDir. */
  private static workspaceCache = new Map<string, WorkspaceDiagnosticCache>();

  private static refreshDebounced = debounceKeyed(
    (document: vscode.TextDocument) => {
      DiagnosticService.refreshDiagnosticsNow(document, false);
    },
    DiagnosticService.REFRESH_DELAY_MS,
    (document: vscode.TextDocument) => document.uri.toString(),
  );

  public static initialize(context: vscode.ExtensionContext): void {
    this._collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
    context.subscriptions.push(this._collection);

    if (process.env["DATA7_LINT_PROFILE"] === "1") {
      LintPipelineProfiler.setEnabled(true);
    }

    context.subscriptions.push(
      vscode.commands.registerCommand("data7.refreshDiagnostics", (uriStr: string) => {
        const doc = vscode.workspace.textDocuments.find(
          (d) => d.uri.toString().toLowerCase() === uriStr.toLowerCase(),
        );
        if (doc) {
          this.refreshDiagnosticsNow(doc, true);
        }
      }),
    );

    const handleDocument = (doc: vscode.TextDocument, reevaluateDependent = false): void => {
      // Skip debounced linting while a batch fix or batch lint is in progress.
      if (WorkspaceFixService.isBatchFixInProgress) return;

      if (!this.workspaceIndexReady && !reevaluateDependent) {
        this.pendingOpenDocuments.add(doc.uri.toString().toLowerCase());
        return;
      }

      const uriKey = doc.uri.toString().toLowerCase();
      if (!reevaluateDependent) {
        if (Date.now() < (this.suppressLiveLintUntil.get(uriKey) ?? 0)) {
          return;
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
      this.invalidateWorkspaceCacheFor(uri.fsPath);
    });
    jsonWatcher.onDidCreate((uri) => {
      this.invalidateWorkspaceCacheFor(uri.fsPath);
    });
    jsonWatcher.onDidDelete((uri) => {
      this.invalidateWorkspaceCacheFor(uri.fsPath);
    });
    context.subscriptions.push(cfgWatcher, jsonWatcher);
  }

  private static handleExtensionSettingsChanged(): void {
    this.workspaceCache.clear();
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

  /** Suppresses debounced live lint for a URI until `durationMs` elapses. */
  public static suppressLiveLintForUri(uri: vscode.Uri, durationMs: number): void {
    this.suppressLiveLintUntil.set(uri.toString().toLowerCase(), Date.now() + durationMs);
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
    this._collection?.delete(uri);
    const key = uri.toString().toLowerCase();
    this.liveDiagnosticUris.delete(key);
    this.workspaceDiagnosticUris.delete(key);
    this.unusedCodeByUri.delete(key);
  }

  public static replaceDiagnosticsFromBatch(
    entries: readonly {
      readonly uri: vscode.Uri;
      readonly diagnostics: readonly vscode.Diagnostic[];
    }[],
  ): void {
    for (const entry of entries) {
      const uriKey = entry.uri.toString().toLowerCase();
      if (entry.diagnostics.length === 0) {
        this._collection?.delete(entry.uri);
        this.liveDiagnosticUris.delete(uriKey);
        this.workspaceDiagnosticUris.delete(uriKey);
        this.unusedCodeByUri.delete(uriKey);
        continue;
      }

      this.publishMergedDiagnostics(entry.uri, [...entry.diagnostics], "workspace");
      const isOpen = vscode.workspace.textDocuments.some(
        (doc) => doc.uri.toString().toLowerCase() === uriKey,
      );
      if (isOpen) {
        this.liveDiagnosticUris.set(uriKey, entry.uri);
        this.workspaceDiagnosticUris.delete(uriKey);
      } else {
        this.workspaceDiagnosticUris.set(uriKey, entry.uri);
        this.liveDiagnosticUris.delete(uriKey);
      }
    }
  }

  public static pruneClosedDiagnostics(): void {
    const openUris = new Set(
      vscode.workspace.textDocuments
        .filter((document) => this.isLiveDiagnosticDocument(document))
        .map((document) => document.uri.toString().toLowerCase()),
    );
    for (const uriKey of Array.from(this.liveDiagnosticUris.keys())) {
      if (!openUris.has(uriKey)) {
        const uri = this.liveDiagnosticUris.get(uriKey);
        // Do not prune diagnostics for workspace files
        if (uri && !vscode.workspace.getWorkspaceFolder(uri)) {
          this.liveDiagnosticUris.delete(uriKey);
          this._collection?.delete(uri);
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

    this.scheduleUnusedCodeRefresh();

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
  private static reevaluateDependentFiles(triggerUri: vscode.Uri): void {
    this.pendingDependentTriggerUri = triggerUri;
    if (this.dependentPropagationScheduled) {
      return;
    }
    this.dependentPropagationScheduled = true;
    setTimeout(() => {
      this.dependentPropagationScheduled = false;
      const uri = this.pendingDependentTriggerUri;
      this.pendingDependentTriggerUri = undefined;
      if (!uri) return;
      void this.runDependentPropagation(uri);
    }, 80);
  }

  private static async runDependentPropagation(triggerUri: vscode.Uri): Promise<void> {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const triggerUriStr = triggerUri.toString();

    if (!indexer.hasLastUpdateChangedAPI(triggerUriStr)) {
      return;
    }

    const extraNamespaces = new Set<string>(indexer.changedNamespacesInLastUpdate);
    indexer.changedNamespacesInLastUpdate.clear();

    const dependentUriStrs = LintPipelineProfiler.measure(
      "dependent-propagation",
      triggerUriStr,
      () => indexer.getDependentFileUris(triggerUriStr, extraNamespaces),
    );

    if (dependentUriStrs.length === 0) return;

    LintPipelineProfiler.recordDependentPropagation(dependentUriStrs.length);
    LintPipelineProfiler.finalizeFile(triggerUriStr, dependentUriStrs.length);

    const dependentUris: vscode.Uri[] = [];
    for (const uriStr of dependentUriStrs) {
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

    for (const uri of dependentUris) {
      this.pendingDependentUris.add(uri.toString().toLowerCase());
      LanguageProcessor.getInstance().invalidate(uri.toString());
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

  public static async findWorkspaceBasFiles(workspaceDir?: string): Promise<vscode.Uri[]> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      return [];
    }
    const uris = await vscode.workspace.findFiles("**/*.{bas,d7b}");
    return uris.filter((uri) => {
      const fsPath = uri.fsPath;
      return (
        uri.scheme === "file" &&
        !isExcluded(fsPath) &&
        !isReadOnlyModuleFile(fsPath) &&
        (!workspaceDir || this.isPathInsideWorkspace(fsPath, workspaceDir))
      );
    });
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
      this.refreshDiagnosticsNow(existingDoc, reevaluateDependent);
      return this._collection?.get(uri) ? [...this._collection.get(uri)!] : [];
    }
    // Otherwise lint from disk without opening an editor tab.
    const diags = this.lintFileFromDisk(uri);
    this.publishMergedDiagnostics(uri, diags, "workspace");
    return this._collection?.get(uri) ? [...this._collection.get(uri)!] : [];
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
      }

      const actions =
        totalIssues > 0
          ? ["Corrigir Tudo (Ajuste em Massa)", "Reiniciar Linter"]
          : ["Reiniciar Linter"];
      vscode.window.showInformationMessage(msg, ...actions).then(async (selection) => {
        if (selection === "Corrigir Tudo (Ajuste em Massa)") {
          await vscode.commands.executeCommand("data7.fixAllWorkspace");
        } else if (selection === "Reiniciar Linter") {
          await vscode.commands.executeCommand("data7.runLinter");
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

    this.clearWorkspaceDiagnostics();

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
    } finally {
      WorkspaceFixService.isBatchFixInProgress = false;
    }

    await this.refreshUnusedCodeDiagnostics(uris);

    return { errorCount, warningCount, infoCount, fileCount: uris.length };
  }

  private static async lintUriForBatch(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
    );
    if (openDoc) {
      this.refreshDiagnosticsNow(openDoc, false);
      return this._collection?.get(uri) ? [...this._collection.get(uri)!] : [];
    }

    const diags = await this.lintFileFromDiskAsync(uri);
    this.publishMergedDiagnostics(uri, diags, "workspace");
    return this._collection?.get(uri) ? [...this._collection.get(uri)!] : [];
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
      const advanced = this.deserializeWorkerDiagnostics(
        workerResult.diagnosticsByUri.get(uriStr) ?? [],
      );
      const merged = [...preamble, ...advanced];
      this.publishMergedDiagnostics(uri, merged, "workspace");
      for (const diag of this._collection?.get(uri) ?? merged) {
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
          "active",
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
    this.lintGenerations.clear();
    this.workspaceIndexReady = false;
    this.pendingOpenDocuments.clear();
    this.suppressLiveLintUntil.clear();
    this.dependentPropagationScheduled = false;
    this.pendingDependentTriggerUri = undefined;
    this.refreshDebounced.cancelAll();
    SemanticLintCache.resetForTests();
  }

  private static deserializeWorkerDiagnostics(
    diagnostics: readonly SerializedLintDiagnostic[],
  ): vscode.Diagnostic[] {
    return diagnostics.map((diag) => {
      const result = new vscode.Diagnostic(
        new vscode.Range(diag.startLine, diag.startChar, diag.endLine, diag.endChar),
        diag.message,
        diag.severity,
      );
      if (diag.code !== undefined) {
        result.code = diag.code as string | number | { value: string | number; target: vscode.Uri };
      }
      if (diag.source !== undefined) {
        result.source = diag.source;
      }
      return result;
    });
  }

  private static isEnabled(): boolean {
    return readConfiguration().features.diagnostics.enabled;
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

  private static clearWorkspaceDiagnostics(): void {
    for (const uri of this.workspaceDiagnosticUris.values()) {
      this._collection?.delete(uri);
      this.unusedCodeByUri.delete(uri.toString().toLowerCase());
    }
    this.workspaceDiagnosticUris.clear();
  }

  /**
   * Publishes file diagnostics merged with any project-wide unused-code hits.
   */
  private static publishMergedDiagnostics(
    uri: vscode.Uri,
    baseDiags: readonly vscode.Diagnostic[],
    origin: "live" | "workspace",
  ): void {
    const key = uri.toString().toLowerCase();
    const withoutUnusedCode = baseDiags.filter(
      (d) => d.code !== DiagnosticCodes.UnusedCode,
    );
    const unusedCode = this.unusedCodeByUri.get(key) ?? [];
    this._collection?.set(uri, [...withoutUnusedCode, ...unusedCode]);
    if (origin === "live") {
      this.liveDiagnosticUris.set(key, uri);
      this.workspaceDiagnosticUris.delete(key);
    } else {
      this.workspaceDiagnosticUris.set(key, uri);
    }
  }

  private static scheduleUnusedCodeRefresh(): void {
    if (this.unusedCodeRefreshScheduled) return;
    this.unusedCodeRefreshScheduled = true;
    setTimeout(() => {
      this.unusedCodeRefreshScheduled = false;
      void this.refreshUnusedCodeDiagnostics();
    }, 600);
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

      for (const hit of hits) {
        const key = hit.fileUri.toLowerCase();
        const module = modules.find((m) => m.fileUri.toLowerCase() === key);
        const filtered = module
          ? this.filterSuppressedDiagnostics(module.code, [hit.diagnostic])
          : [hit.diagnostic];
        if (filtered.length === 0) continue;
        const list = nextMap.get(key) ?? [];
        list.push(...filtered);
        nextMap.set(key, list);
      }
    }

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
      const existing = this._collection?.get(uri) ?? [];
      const base = existing.filter((d) => d.code !== DiagnosticCodes.UnusedCode);
      const unusedCode = nextMap.get(key) ?? [];
      if (base.length === 0 && unusedCode.length === 0) {
        this._collection?.delete(uri);
        continue;
      }
      this._collection?.set(uri, [...base, ...unusedCode]);
      if (!tracked) {
        this.workspaceDiagnosticUris.set(key, uri);
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
    for (const uri of uris) {
      const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
      );
      let code: string;
      if (openDoc) {
        code = openDoc.getText();
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
