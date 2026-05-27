import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { SharedModuleInfo } from "../analysis/dependency-scanner";
import { DependencyScanner, IMPORTS_REGEX } from "../analysis/dependency-scanner";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { DiagnosticCodes, setDiagnosticPayload } from "../diagnostics/diagnostic-codes";
import { debounceKeyed } from "../utils/debounce";
import { isExcluded } from "../infra/configuration";
import { logger } from "../infra/logger";
import { DIAGNOSTIC_SOURCE, LANGUAGE_IDS, PROJECT_CONFIG_FILENAME } from "../infra/constants";

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

  /** Cache of expensive workspace-level data, keyed by workspaceDir. */
  private static workspaceCache = new Map<string, WorkspaceDiagnosticCache>();

  private static refreshDebounced = debounceKeyed(
    (document: vscode.TextDocument) => {
      DiagnosticService.refreshDiagnosticsNow(document);
    },
    DiagnosticService.REFRESH_DELAY_MS,
    (document: vscode.TextDocument) => document.uri.toString(),
  );

  public static initialize(context: vscode.ExtensionContext): void {
    this._collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
    context.subscriptions.push(this._collection);

    const handleDocument = (doc: vscode.TextDocument): void => {
      if (doc.languageId !== LANGUAGE_IDS.d7basic && !doc.fileName.endsWith(".bas")) return;
      WorkspaceSymbolIndexer.getInstance().updateFileContent(doc.uri.toString(), doc.getText());
      this.refreshDebounced(doc);
    };

    vscode.workspace.onDidOpenTextDocument(handleDocument, null, context.subscriptions);
    vscode.workspace.onDidSaveTextDocument(
      (doc) => {
        this.invalidateWorkspaceCacheFor(doc.fileName);
        handleDocument(doc);
      },
      null,
      context.subscriptions,
    );
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        handleDocument(e.document);
      },
      null,
      context.subscriptions,
    );

    // Invalidate cached repo scans when the user changes settings or files on disk.
    const cfgWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(DIAGNOSTIC_SOURCE)) {
        this.workspaceCache.clear();
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
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.refreshDebounced(editor.document);
    });
  }

  /**
   * Public synchronous entry point. Callers that need an immediate refresh
   * (tests, manual triggers) bypass the debounce.
   */
  public static refreshDiagnostics(document: vscode.TextDocument): void {
    this.refreshDiagnosticsNow(document);
  }

  private static refreshDiagnosticsNow(document: vscode.TextDocument): void {
    if (document.languageId !== LANGUAGE_IDS.d7basic && !document.fileName.endsWith(".bas")) {
      return;
    }

    // Honour `data7.exclude` — clear any prior diagnostics for the file and bail.
    if (isExcluded(document.fileName)) {
      this._collection?.delete(document.uri);
      return;
    }

    const paths = ProjectService.findProjectPaths(document.fileName);
    if (!paths) {
      this._collection?.delete(document.uri);
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    const wsCache = this.getWorkspaceCache(paths.workspaceDir);

    const lines = text.split(/\r?\n/);
    const importsRegex = IMPORTS_REGEX;
    const directCallRegex = /\b(mod_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+)(?=\.)/i;

    lines.forEach((lineText, lineIndex) => {
      const cleanLine = DependencyScanner.stripComments(lineText);
      if (!cleanLine.trim()) return;

      const match = cleanLine.match(importsRegex);
      if (match) {
        const modName = match[1];
        this.validateModuleReference(
          modName,
          lineIndex,
          cleanLine.indexOf(modName),
          diagnostics,
          wsCache,
          true,
        );
      }

      const dMatch = directCallRegex.exec(cleanLine);
      if (dMatch) {
        const modName = dMatch[1];
        if (!DependencyScanner.isIgnoredNamespace(modName.toLowerCase())) {
          this.validateModuleReference(
            modName,
            lineIndex,
            cleanLine.indexOf(modName),
            diagnostics,
            wsCache,
            false,
          );
        }
      }
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
  }

  private static validateModuleReference(
    modName: string,
    lineIndex: number,
    charIndex: number,
    diagnostics: vscode.Diagnostic[],
    wsCache: WorkspaceDiagnosticCache,
    isExplicit: boolean,
  ): void {
    const lowerModName = modName.toLowerCase();
    if (wsCache.localModules.has(lowerModName)) return;
    if (DependencyScanner.isIgnoredNamespace(lowerModName)) return;

    let resolvedKey = lowerModName;
    if (!wsCache.sharedModules.has(resolvedKey)) {
      if (wsCache.sharedModules.has("mod_" + resolvedKey)) {
        resolvedKey = "mod_" + resolvedKey;
      } else {
        if (isExplicit || lowerModName.startsWith("mod_")) {
          const range = new vscode.Range(
            lineIndex,
            charIndex,
            lineIndex,
            charIndex + modName.length,
          );
          const diag = new vscode.Diagnostic(
            range,
            `Módulo "${modName}" não foi encontrado. Implemente-o localmente ou adicione-o ao repositório global de módulos.`,
            vscode.DiagnosticSeverity.Error,
          );
          diag.code = DiagnosticCodes.ModuleNotFound;
          setDiagnosticPayload(diag, {
            code: DiagnosticCodes.ModuleNotFound,
            moduleName: modName,
          });
          diagnostics.push(diag);
        }
        return;
      }
    }

    const isDeclared = Object.keys(wsCache.dependencies).some(
      (k) => k.toLowerCase() === resolvedKey,
    );
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
    if (fs.existsSync(configJsonPath)) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
        if (parsed && typeof parsed === "object" && "dependencies" in parsed) {
          const deps = (parsed as { dependencies?: unknown }).dependencies;
          if (deps && typeof deps === "object") {
            dependencies = deps as Record<string, string>;
          }
        }
      } catch (err) {
        logger.warn(
          `Falha ao ler data7.json em ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);

    const srcDir = path.join(workspaceDir, "src");
    const localModules = new Set<string>();
    if (fs.existsSync(srcDir)) {
      const basFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas"]);
      for (const file of basFiles) {
        localModules.add(path.basename(file, ".bas").toLowerCase());
        try {
          const content = fs.readFileSync(file, "utf-8");
          const nsMatch = /\bNamespace\s+([a-zA-Z0-9_]+)/i.exec(content);
          if (nsMatch) localModules.add(nsMatch[1].toLowerCase());
        } catch {
          // Skip files we cannot read; the indexer will report them separately.
        }
      }
    }

    const snapshot: WorkspaceDiagnosticCache = { dependencies, sharedModules, localModules };
    this.workspaceCache.set(workspaceDir, snapshot);
    return snapshot;
  }

  /**
   * Drops cached scans for any workspace that contains the given file path.
   * Called when `data7.json`, a `.bas` file, or the configuration changes.
   */
  private static invalidateWorkspaceCacheFor(filePath: string): void {
    for (const workspaceDir of Array.from(this.workspaceCache.keys())) {
      if (filePath.toLowerCase().startsWith(workspaceDir.toLowerCase())) {
        this.workspaceCache.delete(workspaceDir);
      }
    }
  }

  /** Test-only hook: clears all cached state. */
  public static __resetForTests(): void {
    this.workspaceCache.clear();
  }
}

interface WorkspaceDiagnosticCache {
  dependencies: Record<string, string>;
  sharedModules: Map<string, SharedModuleInfo>;
  localModules: Set<string>;
}
