import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { LanguageProcessor } from "../analysis/language-processor";
import { DiagnosticsLinter } from "../diagnostics/diagnostics";
import { isExcluded, isReadOnlyModuleFile } from "../infra/configuration";
import { DIAGNOSTIC_SOURCE } from "../infra/constants";
import { D7BasicCodeActionProvider } from "../providers/code-action-provider";
import { logger } from "../infra/logger";
import { buildMockDocument, applyTextEditsToContent } from "../utils/text-edit-utils";

interface WorkspaceFixResult {
  readonly filesScanned: number;
  readonly filesFixed: number;
  readonly totalEdits: number;
}

interface WorkspaceFixOptions {
  readonly save?: boolean;
  readonly workspaceDir?: string;
}

export interface BuildWorkspaceFixOptions {
  /**
   * `changed` skips files whose on-disk fingerprint matches the latest
   * pre-build pass for this workspace. `all` is reserved for an
   * explicit full correction request.
   */
  readonly mode?: "all" | "changed";
}

export class WorkspaceFixService {
  private static readonly buildFixFingerprints = new Map<string, Map<string, string>>();

  /**
   * Set to `true` while a batch fix (or batch lint) is running.
   * `DiagnosticService.handleDocument` checks this flag and skips debounced
   * re-linting during the operation, preventing an avalanche of redundant
   * linter runs — one per file opened/saved by the batch pipeline.
   */
  public static isBatchFixInProgress = false;

  public static async fixAllWorkspace(): Promise<void> {
    const candidateUris = await this.findCandidateUris();
    if (candidateUris.length === 0) {
      vscode.window.showInformationMessage(
        "Nenhum arquivo Data7 Basic (.bas, .d7b) encontrado no workspace.",
      );
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Deseja aplicar as correções automáticas de sintaxe/estilo em ${candidateUris.length} arquivo(s) do workspace?`,
      "Sim",
      "Não",
    );
    if (confirm !== "Sim") return;

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Aplicando correções no workspace...",
        cancellable: true,
      },
      async (progress, token) =>
        this.applyFixesToUris(candidateUris, {
          save: true,
          progress,
          token,
        }),
    );

    const message =
      result.totalEdits === 0
        ? "Nenhuma correção automática aplicável foi encontrada."
        : `Correção concluída: ${result.filesFixed} arquivo(s) ajustado(s), ${result.totalEdits} edição(ões).`;
    vscode.window.showInformationMessage(message);
  }

  public static async fixActiveEditor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document || document.languageId !== "d7basic" || document.uri.scheme !== "file") {
      vscode.window.showInformationMessage("Abra um arquivo Data7 Basic para aplicar correcoes.");
      return;
    }

    const provider = new D7BasicCodeActionProvider();
    const existingDiagnostics = vscode.languages
      .getDiagnostics(document.uri)
      .filter(
        (diagnostic) => diagnostic.source === DIAGNOSTIC_SOURCE || diagnostic.source === undefined,
      );
    const diagnostics =
      existingDiagnostics.length > 0
        ? existingDiagnostics
        : this.collectDiagnosticsFromDocument(document);
    if (diagnostics.length === 0) {
      vscode.window.showInformationMessage(
        "Nenhum diagnostico aplicavel encontrado no arquivo ativo.",
      );
      return;
    }

    const fixEdit = provider.buildFixAllWorkspaceEdit(document, diagnostics);
    if (!fixEdit) {
      vscode.window.showInformationMessage(
        "Nenhuma correcao automatica aplicavel no arquivo ativo.",
      );
      return;
    }

    const applied = await vscode.workspace.applyEdit(fixEdit.edit);
    if (!applied) {
      vscode.window.showWarningMessage("Nao foi possivel aplicar as correcoes no arquivo ativo.");
      return;
    }
    await document.save();

    try {
      const { DiagnosticService } = await import("./diagnostic-service");
      DiagnosticService.refreshAllActive();
    } catch {
      // Avoid circular-dependency crash if import fails.
    }

    vscode.window.showInformationMessage(
      `Correcao do arquivo ativo concluida: ${fixEdit.count} edicao(oes).`,
    );
  }

  public static async fixWorkspaceForBuild(
    workspaceDir: string,
    options: BuildWorkspaceFixOptions = {},
  ): Promise<WorkspaceFixResult> {
    const uris = await this.findCandidateUris(workspaceDir);
    const mode = options.mode ?? "changed";
    const buildFixCache = this.getBuildFixCache(workspaceDir);
    const candidates =
      mode === "all" ? uris : uris.filter((uri) => this.hasBuildFileChanged(uri, buildFixCache));
    const result = await this.applyFixesToUris(candidates, { save: true, workspaceDir });

    if (mode === "changed") {
      this.updateBuildFixCache(uris, buildFixCache);
    }
    return result;
  }

  /** Clears incremental build-fix state for isolated tests. */
  public static __resetBuildFixCacheForTests(): void {
    this.buildFixFingerprints.clear();
  }

  public static buildWillSaveTextEdits(
    document: vscode.TextDocument,
  ): vscode.TextEdit[] | undefined {
    const diagnostics = this.collectDiagnosticsFromDocument(document);
    if (diagnostics.length === 0) return undefined;

    const provider = new D7BasicCodeActionProvider();
    const fixEdit = provider.buildFixAllWorkspaceEdit(document, diagnostics);
    if (!fixEdit) return undefined;

    return this.extractTextEditsForDocument(document.uri, fixEdit.edit);
  }

  /**
   * Core batch pipeline. For each candidate URI:
   *  1. Read content from disk via `node:fs` (no VS Code document events).
   *  2. Build a lightweight mock TextDocument and collect diagnostics.
   *  3. Compute TextEdits via the code-action provider.
   *  4. Apply edits in-memory with `applyTextEditsToContent`.
   *  5. Write the corrected file directly to disk via `node:fs`.
   *
   * This avoids opening editors (`openTextDocument`), avoids `applyEdit` (which
   * triggers `onDidChangeTextDocument` for every file), and avoids per-file
   * `.save()` calls (which trigger `onDidSaveTextDocument`). A single
   * `DiagnosticService.refreshAllActive()` at the end re-lints whatever is
   * currently open in the editor, keeping the Problems panel consistent.
   */
  private static async applyFixesToUris(
    uris: readonly vscode.Uri[],
    options: WorkspaceFixOptions & {
      readonly progress?: { report(value: { message?: string; increment?: number }): void };
      readonly token?: vscode.CancellationToken;
    } = {},
  ): Promise<WorkspaceFixResult> {
    const provider = new D7BasicCodeActionProvider();

    let filesFixed = 0;
    let totalEdits = 0;

    // Suppress DiagnosticService debounced linting while the batch runs.
    WorkspaceFixService.isBatchFixInProgress = true;
    try {
      for (let index = 0; index < uris.length; index++) {
        if (options.token?.isCancellationRequested) {
          break;
        }

        const uri = uris[index];
        if (!uri) continue;

        // Yield the event loop so VS Code can repaint the progress bar
        // between iterations. fs.readFileSync + synchronous parse would
        // otherwise monopolise the main thread and freeze the UI.
        await new Promise<void>((resolve) => setImmediate(resolve));

        options.progress?.report({
          message: `Processando ${index + 1}/${uris.length} (${vscode.workspace.asRelativePath(uri)})`,
          increment: uris.length > 0 ? 100 / uris.length : undefined,
        });

        try {
          // Read file content from disk without opening an editor tab.
          const content = this.readFileSafe(uri.fsPath);
          if (content === undefined) continue;

          // Build a lightweight mock document (no VS Code events fired).
          const mockDoc = buildMockDocument(uri, content);
          const diagnostics = this.collectDiagnosticsFromDocument(mockDoc);
          if (diagnostics.length === 0) continue;

          const fixEdit = provider.buildFixAllWorkspaceEdit(mockDoc, diagnostics);
          if (!fixEdit) continue;

          // Collect the TextEdits for this file from the WorkspaceEdit.
          const textEdits = this.extractTextEditsForDocument(uri, fixEdit.edit);
          if (textEdits.length === 0) continue;

          // Apply edits in-memory (no applyEdit → no onDidChangeTextDocument).
          const correctedContent = applyTextEditsToContent(content, textEdits);
          if (correctedContent === content) continue;

          // Write corrected file directly to disk.
          if (options.save !== false) {
            fs.writeFileSync(uri.fsPath, correctedContent, "utf-8");
            // Invalidate parser cache so hover/completion reflects new content.
            LanguageProcessor.getInstance().invalidate(uri.toString());
          }

          totalEdits += textEdits.length;
          filesFixed++;
        } catch (error) {
          logger.error(`Erro ao aplicar correções automáticas para ${uri.fsPath}.`, error);
        }
      }
    } finally {
      WorkspaceFixService.isBatchFixInProgress = false;
    }

    if (totalEdits > 0 && options.save !== false) {
      // Reload any documents that are currently open in the editor so the
      // in-memory buffer reflects the corrected on-disk content, then
      // re-run diagnostics for all open files in one pass.
      await this.reloadOpenDocuments(uris);
    }

    return { filesScanned: uris.length, filesFixed, totalEdits };
  }

  /**
   * For files that were written to disk during the batch and happen to be
   * currently open in the editor, ask VS Code to revert the buffer so it
   * reflects the new on-disk content.  This avoids showing a "file changed on
   * disk" prompt to the user.
   */
  private static async reloadOpenDocuments(uris: readonly vscode.Uri[]): Promise<void> {
    const uriSet = new Set(uris.map((u) => u.toString().toLowerCase()));
    for (const doc of vscode.workspace.textDocuments) {
      if (uriSet.has(doc.uri.toString().toLowerCase()) && doc.uri.scheme === "file") {
        try {
          await vscode.commands.executeCommand("workbench.action.revertFile", doc.uri);
        } catch {
          // Non-critical: if revert fails the user will see the disk-change prompt.
        }
      }
    }

    // Single re-lint pass for all currently open documents.
    try {
      const { DiagnosticService } = await import("./diagnostic-service");
      DiagnosticService.refreshAllActive();
    } catch {
      // Avoid circular-dependency crash if import fails.
    }
  }

  // ---------------------------------------------------------------------------
  // Diagnostics helpers
  // ---------------------------------------------------------------------------

  /**
   * Collects diagnostics for a document (real or mock). Used by both the
   * batch pipeline (mock docs) and `buildWillSaveTextEdits` (real docs).
   */
  private static collectDiagnosticsFromDocument(
    document: vscode.TextDocument,
  ): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();

    try {
      const cachedDoc = LanguageProcessor.getInstance().getOrParse(document.uri.toString(), text);
      cachedDoc.errors.forEach((error) => {
        const line = Math.max(0, error.loc.line - 1);
        const column = Math.max(0, error.loc.column);
        const range = new vscode.Range(line, column, line, column + 1);
        const severity =
          error.code === "expected-token" && error.message.toLowerCase().includes("expected 'then'")
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
        const diagnostic = new vscode.Diagnostic(range, error.message, severity);
        diagnostic.code = error.code;
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostics.push(diagnostic);
      });
    } catch (error) {
      logger.warn(
        `Falha ao coletar erros sintáticos para ${document.uri.fsPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      diagnostics.push(
        ...DiagnosticsLinter.runAdvancedDiagnostics(document, WorkspaceSymbolIndexer.getInstance()),
      );
    } catch (error) {
      logger.warn(
        `Falha ao coletar diagnósticos avançados para ${document.uri.fsPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return diagnostics;
  }

  private static async findCandidateUris(workspaceDir?: string): Promise<vscode.Uri[]> {
    const uris = await vscode.workspace.findFiles("**/*.{bas,d7b}");
    return uris.filter((uri) => {
      const fsPath = uri.fsPath;
      if (workspaceDir && !this.isInsideWorkspaceDir(fsPath, workspaceDir)) {
        return false;
      }
      return !isExcluded(fsPath) && !isReadOnlyModuleFile(fsPath);
    });
  }

  private static getBuildFixCache(workspaceDir: string): Map<string, string> {
    const workspaceKey = path.resolve(workspaceDir).toLowerCase();
    let cache = this.buildFixFingerprints.get(workspaceKey);
    if (!cache) {
      cache = new Map<string, string>();
      this.buildFixFingerprints.set(workspaceKey, cache);
    }
    return cache;
  }

  private static hasBuildFileChanged(uri: vscode.Uri, cache: ReadonlyMap<string, string>): boolean {
    const fingerprint = this.getFileFingerprint(uri.fsPath);
    if (!fingerprint) return true;
    return cache.get(uri.fsPath.toLowerCase()) !== fingerprint;
  }

  private static updateBuildFixCache(
    uris: readonly vscode.Uri[],
    cache: Map<string, string>,
  ): void {
    const currentPaths = new Set<string>();
    for (const uri of uris) {
      const fileKey = uri.fsPath.toLowerCase();
      currentPaths.add(fileKey);
      const fingerprint = this.getFileFingerprint(uri.fsPath);
      if (fingerprint) {
        cache.set(fileKey, fingerprint);
      } else {
        cache.delete(fileKey);
      }
    }

    for (const cachedPath of cache.keys()) {
      if (!currentPaths.has(cachedPath)) cache.delete(cachedPath);
    }
  }

  private static getFileFingerprint(filePath: string): string | undefined {
    try {
      const stat = fs.statSync(filePath);
      return `${stat.mtimeMs.toString()}:${stat.size.toString()}`;
    } catch {
      return undefined;
    }
  }

  private static isInsideWorkspaceDir(filePath: string, workspaceDir: string): boolean {
    const normalizedFile = path.resolve(filePath).toLowerCase();
    const normalizedWorkspace = path.resolve(workspaceDir).toLowerCase();
    return (
      normalizedFile === normalizedWorkspace ||
      normalizedFile.startsWith(`${normalizedWorkspace}${path.sep}`)
    );
  }

  /** Reads a file from disk, returning `undefined` on any I/O error. */
  private static readFileSafe(fsPath: string): string | undefined {
    try {
      return fs.readFileSync(fsPath, "utf-8");
    } catch (err) {
      logger.warn(`Falha ao ler ${fsPath}: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  private static extractTextEditsForDocument(
    uri: vscode.Uri,
    edit: vscode.WorkspaceEdit,
  ): vscode.TextEdit[] {
    if (typeof edit.entries === "function") {
      for (const [entryUri, edits] of edit.entries()) {
        if (entryUri.toString() === uri.toString()) {
          return edits;
        }
      }
      return [];
    }

    const textEdits: vscode.TextEdit[] = [];
    const mockEdits = (edit as { edits?: unknown[] }).edits;
    if (!Array.isArray(mockEdits)) return textEdits;

    for (const mockEdit of mockEdits) {
      const entry = mockEdit as
        | { type: "insert"; uri: vscode.Uri; position: vscode.Position; text: string }
        | { type: "replace"; uri: vscode.Uri; range: vscode.Range; text: string }
        | { type: "delete"; uri: vscode.Uri; range: vscode.Range };
      if (entry.uri.toString() !== uri.toString()) continue;
      if (entry.type === "insert") {
        textEdits.push(vscode.TextEdit.insert(entry.position, entry.text));
      } else if (entry.type === "replace") {
        textEdits.push(vscode.TextEdit.replace(entry.range, entry.text));
      } else {
        textEdits.push(vscode.TextEdit.replace(entry.range, ""));
      }
    }

    return textEdits;
  }
}
