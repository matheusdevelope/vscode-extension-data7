import * as vscode from "vscode";
import {
  DIAGNOSTIC_SOURCE,
  DependencyScanner,
  DiagnosticCodes,
  DiagnosticsLinter,
  LANGUAGE_IDS,
  LanguageProcessor,
  PROJECT_CONFIG_FILENAME,
  SymbolParser,
  WorkspaceSymbolIndexer,
  buildMockDocument,
  debounceKeyed,
  getCoreModulesPath,
  isExcluded,
  isReadOnlyModuleFile,
  logger,
  lookupSystemNamespaceOrClassByName,
  readConfiguration,
  readProjectConfig,
  setDiagnosticPayload,
} from "@data7/core";
import type { SharedModuleInfo } from "@data7/core";

import * as path from "path";
import * as fs from "fs";

import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";

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
  private static readonly REFRESH_DELAY_MS = 250;
  private static readonly liveDiagnosticUris = new Map<string, vscode.Uri>();
  private static readonly workspaceDiagnosticUris = new Map<string, vscode.Uri>();
  private static readonly pendingDependentUris = new Set<string>();

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
      // The batch pipeline manages its own diagnostic lifecycle and triggers a
      // single refreshAllActive() at the end, so individual per-file debounces
      // during the batch would be redundant and slow the IDE to a crawl.
      //
      if (WorkspaceFixService.isBatchFixInProgress) return;

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
        this.workspaceCache.clear();
        this.refreshAllActive();
        // `data7.exclude` directly drives what the symbol indexer skips; a
        // change to it (adding/removing globs) leaves the in-memory cache
        // inconsistent with what would now be visible. Trigger a workspace
        // re-index so the indexer's view matches the new settings.
        if (e.affectsConfiguration(`${DIAGNOSTIC_SOURCE}.exclude`)) {
          WorkspaceSymbolIndexer.getInstance()
            .indexWorkspace(vscode.workspace.workspaceFolders)
            .catch((err) => {
              logger.warn(
                `Falha ao reindexar workspace após mudança em data7.exclude: ${err instanceof Error ? err.message : String(err)}`,
              );
            });
        }
      }
    });
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

  public static getCollection(): vscode.DiagnosticCollection {
    if (!this._collection) {
      throw new Error("DiagnosticService.initialize() não foi chamado.");
    }
    return this._collection;
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
    this.liveDiagnosticUris.delete(uri.toString().toLowerCase());
    this.workspaceDiagnosticUris.delete(uri.toString().toLowerCase());
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
        continue;
      }

      this._collection?.set(entry.uri, [...entry.diagnostics]);
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

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    // 1. Unify parsing: parse the document once and obtain the AST
    let cachedDoc: ReturnType<LanguageProcessor["getOrParse"]>;
    try {
      cachedDoc = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
    } catch (err) {
      logger.error("Falha ao obter AST do LanguageProcessor.", err);
      return;
    }

    // 2. Feed the indexer only at debounce time, using the pre-parsed AST to avoid double parses
    if (vscode.workspace.getWorkspaceFolder(document.uri)) {
      const parsedSymbols = SymbolParser.parseFromAst(
        document.uri.toString(),
        text,
        cachedDoc.unit,
      );
      WorkspaceSymbolIndexer.getInstance().updateFileContentFromParsed(
        document.uri.toString(),
        text,
        parsedSymbols,
      );
    }

    const wsCache = this.getWorkspaceCache(paths.workspaceDir);

    try {
      for (const reference of DependencyScanner.collectModuleReferences(text)) {
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
          document.uri.toString(),
        );
      }
    } catch (err: unknown) {
      logger.error("Falha ao coletar referências de módulos via AST.", err);
    }

    // Process cached document syntactical parse errors
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

    try {
      const advanced = DiagnosticsLinter.runAdvancedDiagnostics(
        document,
        WorkspaceSymbolIndexer.getInstance(),
      );
      diagnostics.push(...advanced);
    } catch (err: unknown) {
      logger.error("Falha ao executar diagnósticos avançados.", err);
    }

    this._collection?.set(document.uri, diagnostics);
    this.liveDiagnosticUris.set(document.uri.toString().toLowerCase(), document.uri);
    this.workspaceDiagnosticUris.delete(document.uri.toString().toLowerCase());

    const docUriStr = document.uri.toString().toLowerCase();
    if (
      reevaluateDependent &&
      !DiagnosticService.pendingDependentUris.has(docUriStr) &&
      !WorkspaceFixService.isBatchFixInProgress
    ) {
      DiagnosticService.reevaluateDependentFiles(document.uri);
    }
  }

  /**
   * Reevaluates all workspace files that import any of the namespaces declared in the
   * triggered file, or share the same namespace. This propagates linter corrections
   * and errors across dependencies automatically.
   */
  private static reevaluateDependentFiles(triggerUri: vscode.Uri): void {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const triggerUriStr = triggerUri.toString();
    const triggerFileSyms = indexer.getFileSymbols(triggerUriStr);

    const triggerNamespaces = new Set<string>();
    if (triggerFileSyms) {
      for (const sym of triggerFileSyms.symbols) {
        if (sym.kind === "namespace") {
          triggerNamespaces.add(sym.name.toLowerCase());
        }
      }
    }

    // Combine currently declared namespaces and recently changed/removed ones from the indexer
    const targetNamespaces = new Set<string>([
      ...triggerNamespaces,
      ...indexer.changedNamespacesInLastUpdate,
    ]);

    // Clear the indexer's changed tracking for the next update cycle
    indexer.changedNamespacesInLastUpdate.clear();

    const dependentUris: vscode.Uri[] = [];
    for (const fileSyms of indexer.getAllFileSymbols()) {
      const xUriStr = fileSyms.fileUri;
      if (xUriStr.toLowerCase() === triggerUriStr.toLowerCase()) continue;

      try {
        const xUri = vscode.Uri.parse(xUriStr);
        if (isExcluded(xUri.fsPath) || isReadOnlyModuleFile(xUri.fsPath)) continue;
        if (!vscode.workspace.getWorkspaceFolder(xUri)) continue;

        // Check if X shares any of its namespaces with Y
        const xNamespaces = fileSyms.symbols
          .filter((s) => s.kind === "namespace")
          .map((s) => s.name.toLowerCase());

        let sharesNamespace = false;
        for (const xNs of xNamespaces) {
          if (triggerNamespaces.has(xNs)) {
            sharesNamespace = true;
            break;
          }
        }

        let importsTargetNamespace = false;
        for (const imp of fileSyms.imports) {
          if (targetNamespaces.has(imp.toLowerCase())) {
            importsTargetNamespace = true;
            break;
          }
        }

        if (sharesNamespace || importsTargetNamespace) {
          dependentUris.push(xUri);
        }
      } catch {
        continue;
      }
    }

    if (dependentUris.length === 0) return;

    for (const uri of dependentUris) {
      this.pendingDependentUris.add(uri.toString().toLowerCase());
      // Invalidate the cache of the dependent document to force type resolution update from disk
      LanguageProcessor.getInstance().invalidate(uri.toString());
    }

    // Process dependent files asynchronously so we don't block typing or saving.
    setTimeout(() => {
      for (const uri of dependentUris) {
        const uriStr = uri.toString().toLowerCase();
        try {
          this.lintFile(uri, false);
        } catch (err) {
          logger.error(`Erro ao reavaliar dependente ${uri.fsPath}:`, err);
        } finally {
          this.pendingDependentUris.delete(uriStr);
        }
      }
    }, 50);
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
    this._collection?.set(uri, diags);
    this.workspaceDiagnosticUris.set(uri.toString().toLowerCase(), uri);
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

    const run = async (
      progress?: { report(value: { message?: string; increment?: number }): void },
      token?: { readonly isCancellationRequested: boolean },
    ): Promise<void> => {
      const BATCH_SIZE = 10;
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
              for (const diag of diags) {
                if (diag.severity === vscode.DiagnosticSeverity.Error) {
                  errorCount++;
                } else if (diag.severity === vscode.DiagnosticSeverity.Warning) {
                  warningCount++;
                } else {
                  infoCount++;
                }
              }
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

    return { errorCount, warningCount, infoCount, fileCount: uris.length };
  }

  private static async lintUriForBatch(uri: vscode.Uri): Promise<vscode.Diagnostic[]> {
    const openDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString().toLowerCase() === uri.toString().toLowerCase(),
    );
    if (openDoc) {
      this.refreshDiagnosticsNow(openDoc);
      return this._collection?.get(uri) ? [...this._collection.get(uri)!] : [];
    }

    const diags = await this.lintFileFromDiskAsync(uri);
    this._collection?.set(uri, diags);
    this.workspaceDiagnosticUris.set(uri.toString().toLowerCase(), uri);
    return diags;
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
   * Runs the full diagnostics pipeline on a mock (or real) document object.
   * Extracted from `refreshDiagnosticsNow` so both the live editor path and
   * the batch-from-disk path share identical logic.
   */
  private static collectDiagnosticsFromMockDocument(
    document: vscode.TextDocument,
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const paths = ProjectService.findProjectPaths(document.fileName);
    if (!paths) return [];

    // 1. Unify parsing: parse the document once and obtain the AST
    let cachedDoc: ReturnType<LanguageProcessor["getOrParse"]>;
    try {
      cachedDoc = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
    } catch (err) {
      logger.error("Falha ao obter AST do LanguageProcessor.", err);
      return [];
    }

    // 2. Feed the indexer using the pre-parsed AST
    if (vscode.workspace.getWorkspaceFolder(document.uri)) {
      const parsedSymbols = SymbolParser.parseFromAst(
        document.uri.toString(),
        text,
        cachedDoc.unit,
      );
      WorkspaceSymbolIndexer.getInstance().updateFileContentFromParsed(
        document.uri.toString(),
        text,
        parsedSymbols,
      );
    }

    const wsCache = this.getWorkspaceCache(paths.workspaceDir);

    try {
      for (const reference of DependencyScanner.collectModuleReferences(text)) {
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
          document.uri.toString(),
        );
      }
    } catch (err: unknown) {
      logger.error("Falha ao coletar referências de módulos via AST.", err);
    }

    // Process cached document syntactical parse errors
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

    try {
      const advanced = DiagnosticsLinter.runAdvancedDiagnostics(
        document,
        WorkspaceSymbolIndexer.getInstance(),
      );
      diagnostics.push(...advanced);
    } catch (err: unknown) {
      logger.error("Falha ao executar diagnósticos avançados.", err);
    }

    return diagnostics;
  }

  /** Test-only hook: clears all cached state. */
  public static __resetForTests(): void {
    this.workspaceCache.clear();
    this.liveDiagnosticUris.clear();
    this.workspaceDiagnosticUris.clear();
    this.pendingDependentUris.clear();
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
    }
    this.workspaceDiagnosticUris.clear();
  }
}

interface WorkspaceDiagnosticCache {
  dependencies: Record<string, string>;
  sharedModules: Map<string, SharedModuleInfo>;
  coreModules: Map<string, SharedModuleInfo>;
  localModules: Set<string>;
  localTypes: Set<string>;
}
