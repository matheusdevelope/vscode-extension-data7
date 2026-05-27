import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { logger } from "../infra/logger";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";
import { BuildService } from "./build-service";
import { DependencyService } from "./dependency-service";
import { ProjectService } from "./project-service";
import { SyncWatcher } from "./sync-watcher";
import { DiagnosticCodes } from "../diagnostics/diagnostic-codes";

/**
 * Encapsulates one-shot bootstrap work that runs during extension activation:
 *
 *   - Initial dependency sync.
 *   - Status-bar item for "voltar para repositório".
 *   - Auto-opening Principal.bas.
 *   - Detecting/prompting .7Proj files when the workspace was opened without
 *     going through a Data7 project decomposition.
 *
 * Keeping this logic out of `extension.ts` lets the entry point stay focused on
 * registering commands and language providers (single-responsibility).
 */
export class ActivationService {
  /**
   * Initialises a workspace that already contains a `data7.json` (decomposed
   * Data7 project). Safe to call when no workspace is open — it returns early.
   */
  public static initializeWorkspace(context: vscode.ExtensionContext): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const workspaceDir = folders[0].uri.fsPath;
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) return;

    DependencyService.detectAndSyncProjectDependencies(workspaceDir).catch((err) => {
      logger.error("Erro na detecção de dependências na inicialização.", err);
    });

    const projectFilePath = this.resolveProjectFilePath(workspaceDir, configPath);

    ProjectService.verifyProjectConnection(workspaceDir, projectFilePath).catch((err) => {
      logger.error("Erro ao verificar conexão do projeto.", err);
    });

    if (fs.existsSync(projectFilePath)) {
      SyncWatcher.watchExternalProjectFile(projectFilePath, workspaceDir);
    }

    this.registerStatusBarItems(context);

    const principalPath = path.join(workspaceDir, "src", "Principal.bas");
    if (fs.existsSync(principalPath) && vscode.window.visibleTextEditors.length === 0) {
      vscode.workspace.openTextDocument(principalPath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    }
  }

  /**
   * Listens for `.7Proj` files opened in the editor and offers to decompose,
   * run, open in DevStudio or just view the XML.
   */
  public static async handleProjectDocumentOpen(doc: vscode.TextDocument): Promise<void> {
    if (path.extname(doc.fileName).toLowerCase() !== ".7proj") return;

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const workspaceDir = folders[0].uri.fsPath;
      if (workspaceDir.toLowerCase() === path.dirname(doc.fileName).toLowerCase()) {
        const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
        if (fs.existsSync(configPath)) return;
      }
    }

    const choice = await vscode.window.showInformationMessage(
      `Projeto Data7 (${path.basename(doc.fileName)}) detectado. Como deseja prosseguir?`,
      "Desenvolver (Decompor no VS Code)",
      "Executar no Data7",
      "Abrir no Developer Studio",
      "Apenas Visualizar XML",
    );

    if (choice === "Desenvolver (Decompor no VS Code)") {
      await vscode.commands.executeCommand("data7.openProject", vscode.Uri.file(doc.fileName));
    } else if (choice === "Executar no Data7") {
      await BuildService.runProjectFileDirectly(doc.fileName);
    } else if (choice === "Abrir no Developer Studio") {
      await BuildService.openInDevStudioDirectly(doc.fileName);
    }
  }

  /**
   * Scans the open workspace for `.7Proj` files when the workspace is **not**
   * a Data7 project (no `data7.json`) and prompts the user to open one.
   */
  public static async detectAndPromptProjFiles(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const workspaceDir = folders[0].uri.fsPath;
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (fs.existsSync(configPath)) return;

    try {
      const files = fs.readdirSync(workspaceDir);
      const projFiles = files.filter((f) => f.toLowerCase().endsWith(".7proj"));
      if (projFiles.length === 0) return;

      const message = `Projetos Data7 (.7Proj) detectados nesta pasta. Deseja abrir um projeto com a extensão?`;
      const choice = await vscode.window.showInformationMessage(message, "Sim", "Não");
      if (choice !== "Sim") return;

      let selectedProj = projFiles[0];
      if (projFiles.length > 1) {
        const pick = await vscode.window.showQuickPick(projFiles, {
          placeHolder: "Selecione o projeto Data7 para abrir:",
          ignoreFocusOut: true,
        });
        if (!pick) return;
        selectedProj = pick;
      }
      const fullPath = path.join(workspaceDir, selectedProj);
      await vscode.commands.executeCommand("data7.openProject", vscode.Uri.file(fullPath));
    } catch (err: unknown) {
      logger.error("Erro ao buscar arquivos .7Proj no workspace.", err);
    }
  }

  /**
   * Best-effort resolution of `<projectName>.7Proj` based on the workspace
   * directory and the optional `data7.json` metadata. Always returns a path,
   * even when the file doesn't exist yet.
   */
  public static resolveProjectFilePath(workspaceDir: string, configPath: string): string {
    try {
      const files = fs.readdirSync(workspaceDir);
      const projFile = files.find((f) => f.toLowerCase().endsWith(".7proj"));
      if (projFile) return path.join(workspaceDir, projFile);
    } catch (err: unknown) {
      logger.warn(
        `Falha ao listar ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    try {
      const meta: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (
        meta &&
        typeof meta === "object" &&
        "nome" in meta &&
        typeof (meta as { nome?: unknown }).nome === "string"
      ) {
        const projName = (meta as { nome: string }).nome;
        return path.join(workspaceDir, `${projName}.7Proj`);
      }
    } catch {
      // Fall through to default naming convention.
    }
    return path.join(workspaceDir, `${path.basename(workspaceDir)}.7Proj`);
  }

  /** Navigates the parent folder of the current workspace (useful from status-bar). */
  public static async openParentFolder(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return;
    const workspaceDir = folders[0].uri.fsPath;
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) return;
    const parentDir = path.dirname(workspaceDir);
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(parentDir), {
      forceNewWindow: false,
    });
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Convenience over `vscode.window.createStatusBarItem(...)` — creates a
   * left-aligned status-bar item with text, tooltip and command pre-wired and
   * already shown. Returned instances must still be tracked by the caller
   * (typically added to `context.subscriptions`).
   */
  private static createStatusBarButton(spec: {
    priority: number;
    command: string;
    text: string;
    tooltip: string;
  }): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, spec.priority);
    item.command = spec.command;
    item.text = spec.text;
    item.tooltip = spec.tooltip;
    item.show();
    return item;
  }

  private static registerStatusBarItems(context: vscode.ExtensionContext): void {
    const backItem = this.createStatusBarButton({
      priority: 100,
      command: "data7.openParentFolder",
      text: "$(arrow-left) Voltar para Repositório",
      tooltip: "Clique para voltar para a pasta de projetos principal",
    });
    const docsItem = this.createStatusBarButton({
      priority: 99,
      command: "data7.generateSystemLibraryDocs",
      text: "$(book) Docs SL",
      tooltip: "Data7: gerar documentação da System Library para este projeto",
    });
    const projectItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    projectItem.command = "data7.showOutput";
    projectItem.show();
    this.refreshProjectStatus(projectItem);

    // Refresh on diagnostic changes (errors counter), config changes, and on
    // .bas/.7Proj changes.
    const diagListener = vscode.languages.onDidChangeDiagnostics(() => {
      this.refreshProjectStatus(projectItem);
    });
    const cfgListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("data7")) this.refreshProjectStatus(projectItem);
    });

    context.subscriptions.push(backItem, docsItem, projectItem, diagListener, cfgListener);
  }

  /**
   * Updates a status-bar item to show the current project name, the count of
   * declared dependencies and the count of error/warning diagnostics across
   * the workspace.
   */
  private static refreshProjectStatus(item: vscode.StatusBarItem): void {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      item.hide();
      return;
    }
    const workspaceDir = folders[0].uri.fsPath;
    const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configPath)) {
      item.hide();
      return;
    }

    let projName = path.basename(workspaceDir);
    let depCount = 0;
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const rec = parsed as { nome?: unknown; dependencies?: unknown };
        if (typeof rec.nome === "string" && rec.nome) projName = rec.nome;
        if (
          rec.dependencies &&
          typeof rec.dependencies === "object" &&
          !Array.isArray(rec.dependencies)
        ) {
          depCount = Object.keys(rec.dependencies).length;
        }
      }
    } catch {
      // ignore — show name from folder basename and 0 deps
    }

    let errors = 0;
    let warnings = 0;
    let unsupported = 0;
    for (const [, diags] of vscode.languages.getDiagnostics()) {
      for (const d of diags) {
        if (d.code === DiagnosticCodes.UnsupportedMember) {
          unsupported++;
        } else if (d.severity === vscode.DiagnosticSeverity.Error) {
          errors++;
        } else if (d.severity === vscode.DiagnosticSeverity.Warning) {
          warnings++;
        }
      }
    }

    const statusPart =
      errors > 0
        ? ` · $(error) ${errors}`
        : warnings > 0
          ? ` · $(warning) ${warnings}`
          : " · $(check)";
    const unsupPart = unsupported > 0 ? ` · $(circle-slash) ${unsupported} unsup` : "";
    item.text = `$(database) ${projName} · ${depCount} dep${depCount === 1 ? "" : "s"}${statusPart}${unsupPart}`;
    item.tooltip =
      `Projeto Data7: ${projName}\n` +
      `Dependências: ${depCount}\n` +
      `Erros: ${errors}, Avisos: ${warnings}` +
      (unsupported > 0
        ? `\nMembros não suportados pelo compilador (unsupported-member): ${unsupported}`
        : "") +
      `\nClique para abrir o canal Output "Data7".`;
    item.show();
  }
}
