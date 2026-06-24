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
    const diagnostics = this.collectDiagnostics(document);
    if (diagnostics.length === 0) return undefined;

    const provider = new D7BasicCodeActionProvider();
    const fixEdit = provider.buildFixAllWorkspaceEdit(document, diagnostics);
    if (!fixEdit) return undefined;

    return this.extractTextEditsForDocument(document.uri, fixEdit.edit);
  }

  private static async applyFixesToUris(
    uris: readonly vscode.Uri[],
    options: WorkspaceFixOptions & {
      readonly progress?: { report(value: { message?: string; increment?: number }): void };
      readonly token?: vscode.CancellationToken;
    } = {},
  ): Promise<WorkspaceFixResult> {
    const mergedEdit = new vscode.WorkspaceEdit();
    const touchedUris = new Map<string, vscode.Uri>();
    const provider = new D7BasicCodeActionProvider();

    let filesFixed = 0;
    let totalEdits = 0;

    for (let index = 0; index < uris.length; index++) {
      if (options.token?.isCancellationRequested) {
        break;
      }

      const uri = uris[index];
      if (!uri) continue;

      options.progress?.report({
        message: `Processando ${index + 1}/${uris.length} (${vscode.workspace.asRelativePath(uri)})`,
        increment: uris.length > 0 ? 100 / uris.length : undefined,
      });

      try {
        const document = await vscode.workspace.openTextDocument(uri);
        const diagnostics = this.collectDiagnostics(document);
        if (diagnostics.length === 0) continue;

        const fixEdit = provider.buildFixAllWorkspaceEdit(document, diagnostics);
        if (!fixEdit) continue;

        totalEdits += this.appendWorkspaceEdit(mergedEdit, fixEdit.edit);
        filesFixed++;
        touchedUris.set(uri.toString(), uri);
      } catch (error) {
        logger.error(`Erro ao coletar correções automáticas para ${uri.fsPath}.`, error);
      }
    }

    if (totalEdits === 0) {
      return { filesScanned: uris.length, filesFixed: 0, totalEdits: 0 };
    }

    const applied = await vscode.workspace.applyEdit(mergedEdit);
    if (!applied) {
      throw new Error("O VS Code recusou a aplicação das correções automáticas.");
    }

    if (options.save !== false) {
      for (const uri of touchedUris.values()) {
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const save = (document as vscode.TextDocument & { save?: () => Thenable<boolean> }).save;
          if (typeof save === "function") {
            await save.call(document);
          }
        } catch (error) {
          logger.warn(
            `As correções foram aplicadas em ${uri.fsPath}, mas o arquivo não pôde ser salvo automaticamente: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return { filesScanned: uris.length, filesFixed, totalEdits };
  }

  private static collectDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
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

  private static appendWorkspaceEdit(
    target: vscode.WorkspaceEdit,
    source: vscode.WorkspaceEdit,
  ): number {
    let count = 0;

    if (typeof source.entries === "function") {
      for (const [uri, edits] of source.entries()) {
        for (const edit of edits) {
          if (edit.newText === "") {
            target.delete(uri, edit.range);
          } else if (edit.range.isEmpty) {
            target.insert(uri, edit.range.start, edit.newText);
          } else {
            target.replace(uri, edit.range, edit.newText);
          }
          count++;
        }
      }
      return count;
    }

    const mockEdits = (source as { edits?: unknown[] }).edits;
    if (!Array.isArray(mockEdits)) return 0;

    for (const mockEdit of mockEdits) {
      const entry = mockEdit as
        | { type: "insert"; uri: vscode.Uri; position: vscode.Position; text: string }
        | { type: "replace"; uri: vscode.Uri; range: vscode.Range; text: string }
        | { type: "delete"; uri: vscode.Uri; range: vscode.Range };
      if (entry.type === "insert") {
        target.insert(entry.uri, entry.position, entry.text);
        count++;
      } else if (entry.type === "replace") {
        target.replace(entry.uri, entry.range, entry.text);
        count++;
      } else {
        target.delete(entry.uri, entry.range);
        count++;
      }
    }

    return count;
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
