import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { logger } from "../infra/logger";
import { readConfiguration, getRawConfiguration } from "../infra/configuration";
import { getRepoBasPath, initializeExtensionPaths } from "../infra/extension-paths";
import { parseProjectXml, xmlText, xmlRawText, xmlRecord } from "../utils/xml-helpers";
import { safeJoinInside, isSafeSegment } from "../utils/path-safety";

/**
 * Manages the private repository of shared `.bas` modules that the extension
 * keeps under `vscode.ExtensionContext.globalStorageUri` (fallback
 * `~/.data7_extension/repository`). All writes go through `safeJoinInside`
 * to prevent path traversal from untrusted XML node names.
 *
 * The instance is constructed by `extension.ts` with the activation context;
 * pre-activation callers (e.g. unit tests) fall back to the home-directory
 * path via {@link RepositoryService.create}.
 */
export class RepositoryService {
  private constructor(private readonly repoBasPath: string) {}

  /**
   * Builds a RepositoryService bound to the extension's persistent storage.
   * The actual path resolution (including the `~/.data7_extension/repository`
   * fallback for test/pre-activation callers) lives in `infra/extension-paths`
   * so non-service modules can read it without importing this service.
   */
  public static create(context?: vscode.ExtensionContext): RepositoryService {
    if (context) initializeExtensionPaths(context);
    return new RepositoryService(getRepoBasPath());
  }

  // -----------------------------------------------------------------------
  // Static fallback API. Several legacy call sites and tests rely on
  // `RepositoryService.getRepoBasPath()` without an instance; we keep a thin
  // global accessor that mirrors the instance behavior.
  // -----------------------------------------------------------------------
  private static defaultInstance: RepositoryService | undefined;

  public static initialize(context: vscode.ExtensionContext): RepositoryService {
    this.defaultInstance = RepositoryService.create(context);
    return this.defaultInstance;
  }

  public static getDefault(): RepositoryService {
    this.defaultInstance ??= RepositoryService.create();
    return this.defaultInstance;
  }

  public static getRepoBasPath(): string {
    return getRepoBasPath();
  }

  public static async importModuleToRepository(): Promise<void> {
    return this.getDefault().importModule();
  }

  public static async bulkImportToRepository(): Promise<void> {
    return this.getDefault().bulkImport();
  }

  public static async exploreRepository(): Promise<void> {
    return this.getDefault().exploreRepository();
  }

  // -----------------------------------------------------------------------
  // Instance API
  // -----------------------------------------------------------------------

  public getRepoPath(): string {
    return this.repoBasPath;
  }

  /**
   * Configuration helper to ensure Shared Modules path is configured.
   * Asks the user to pick a folder when none is set; persists it globally.
   */
  public async ensureSharedModulesPath(): Promise<string | undefined> {
    const cfg = getRawConfiguration();
    let sharedModulesPath = readConfiguration().sharedModulesPath;
    if (!sharedModulesPath || !fs.existsSync(sharedModulesPath)) {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: "Selecione a pasta que contém os Módulos Compartilhados (.bas ou .7Proj)",
      });
      if (selected && selected.length > 0) {
        sharedModulesPath = selected[0].fsPath;
        await cfg.update("sharedModulesPath", sharedModulesPath, vscode.ConfigurationTarget.Global);
      } else {
        return undefined;
      }
    }
    return sharedModulesPath;
  }

  public async importModule(): Promise<void> {
    if (!ensureWorkspaceTrusted("Importação para o repositório requer um workspace confiável.")) {
      return;
    }

    const { sharedModulesPath } = readConfiguration();
    const defaultUri =
      sharedModulesPath && fs.existsSync(sharedModulesPath)
        ? vscode.Uri.file(sharedModulesPath)
        : undefined;

    const selectedFiles = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      defaultUri,
      filters: { "Data7 Modules/Projects": ["bas", "7proj", "7Proj"] },
      title: "Selecione o arquivo de origem (.bas ou .7Proj) para importar",
    });

    if (!selectedFiles || selectedFiles.length === 0) return;

    const sourceFile = selectedFiles[0].fsPath;
    const ext = path.extname(sourceFile).toLowerCase();

    try {
      if (ext === ".bas") {
        await this.importBasFile(sourceFile);
      } else if (ext === ".7proj") {
        await this.importProjFile(sourceFile);
      }
    } catch (err: unknown) {
      const message = errorMessage(err);
      logger.error(`Falha ao importar módulo de ${sourceFile}`, err);
      vscode.window.showErrorMessage(`Erro ao importar arquivo: ${message}`);
    }
  }

  private importBasFile(sourceFile: string): Promise<void> {
    this.importBasFileSync(sourceFile);
    return Promise.resolve();
  }

  private importBasFileSync(sourceFile: string): void {
    const content = fs.readFileSync(sourceFile, "utf-8");
    const contentLower = content.toLowerCase();
    const isModule = contentLower.includes("@module") && !contentLower.includes("@module-imported");
    if (!isModule) {
      vscode.window.showWarningMessage(
        "O arquivo selecionado não possui a flag @Module ou contém @Module-Imported. Importação não permitida.",
      );
      return;
    }

    const filename = path.basename(sourceFile, ".bas");
    const nsMatch = /\bNamespace\s+([a-zA-Z0-9_]+)/i.exec(content);
    const modName = nsMatch ? nsMatch[1] : filename;
    this.writeModuleFile(modName, content);

    vscode.window.showInformationMessage(
      `Módulo "${modName}" importado com sucesso para o repositório.`,
    );
  }

  private async importProjFile(sourceFile: string): Promise<void> {
    const xmlContent = fs.readFileSync(sourceFile, "utf-8");
    const parsed = parseProjectXml(xmlContent);
    const root = xmlRecord(parsed, "Projeto_Data7");
    const modulosContainer = xmlRecord(root, "Modulos");

    if (Object.keys(modulosContainer).length === 0) {
      vscode.window.showErrorMessage("Nenhum módulo encontrado no arquivo .7Proj selecionado.");
      return;
    }

    const modNames = Object.keys(modulosContainer).filter((name) => {
      if (name.startsWith("#") || name.startsWith("@_")) return false;
      const mod = modulosContainer[name];
      const code = xmlRawText(mod, "Codigo").toLowerCase();
      return code.includes("@module") && !code.includes("@module-imported");
    });

    if (modNames.length === 0) {
      vscode.window.showErrorMessage(
        "Nenhum módulo válido com a flag @Module (e sem @Module-Imported) encontrado na tag <Modulos>.",
      );
      return;
    }

    const pick = await vscode.window.showQuickPick(modNames, {
      placeHolder: "Selecione o(s) módulo(s) para importar para o repositório:",
      canPickMany: true,
      ignoreFocusOut: true,
    });

    if (!pick || pick.length === 0) return;

    let count = 0;
    for (const modName of pick) {
      const mod = modulosContainer[modName];
      const decodedCode = xmlText(mod, "Codigo");
      this.writeModuleFile(modName, decodedCode);
      count++;
    }

    vscode.window.showInformationMessage(
      `${count} módulo(s) importados com sucesso para o repositório.`,
    );
  }

  public async bulkImport(): Promise<void> {
    if (
      !ensureWorkspaceTrusted(
        "Importação em massa para o repositório requer um workspace confiável.",
      )
    ) {
      return;
    }

    const { sharedModulesPath } = readConfiguration();
    const defaultUri =
      sharedModulesPath && fs.existsSync(sharedModulesPath)
        ? vscode.Uri.file(sharedModulesPath)
        : undefined;

    const selectedFolders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri,
      title: "Selecione a pasta de origem para escanear e importar módulos",
    });

    if (!selectedFolders || selectedFolders.length === 0) return;
    const sourceDir = selectedFolders[0].fsPath;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Escaneando pasta por módulos...",
        cancellable: true,
      },
      async (progress, token) => {
        try {
          const files = DependencyScanner.getFilesRecursive(sourceDir, [".bas", ".7proj"]);
          if (token.isCancellationRequested) return;
          if (files.length === 0) {
            vscode.window.showWarningMessage(
              "Nenhum arquivo .bas ou .7Proj encontrado na pasta selecionada.",
            );
            return;
          }

          interface DetectedModule {
            modName: string;
            sourcePath: string;
            code: string;
            type: "bas" | "7proj";
          }

          const detectedList: DetectedModule[] = [];

          for (const filePath of files) {
            // Token state can change asynchronously between iterations.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (token.isCancellationRequested) return;
            const ext = path.extname(filePath).toLowerCase();
            if (ext === ".bas") {
              try {
                const content = fs.readFileSync(filePath, "utf-8");
                const contentLower = content.toLowerCase();
                if (
                  contentLower.includes("@module") &&
                  !contentLower.includes("@module-imported")
                ) {
                  const filename = path.basename(filePath, ".bas");
                  const nsMatch = /\bNamespace\s+([a-zA-Z0-9_]+)/i.exec(content);
                  const modName = nsMatch ? nsMatch[1] : filename;
                  detectedList.push({ modName, sourcePath: filePath, code: content, type: "bas" });
                }
              } catch (err) {
                logger.warn(`Não foi possível ler ${filePath}: ${errorMessage(err)}`);
              }
            } else if (ext === ".7proj") {
              try {
                const xmlContent = fs.readFileSync(filePath, "utf-8");
                const parsed = parseProjectXml(xmlContent);
                const root = xmlRecord(parsed, "Projeto_Data7");
                const modulosContainer = xmlRecord(root, "Modulos");
                for (const modName of Object.keys(modulosContainer)) {
                  if (modName.startsWith("#") || modName.startsWith("@_")) continue;
                  const mod = modulosContainer[modName];
                  const rawCode = xmlRawText(mod, "Codigo");
                  const codeLower = rawCode.toLowerCase();
                  if (codeLower.includes("@module") && !codeLower.includes("@module-imported")) {
                    detectedList.push({
                      modName,
                      sourcePath: filePath,
                      code: xmlText(mod, "Codigo"),
                      type: "7proj",
                    });
                  }
                }
              } catch (err) {
                logger.warn(`Não foi possível processar ${filePath}: ${errorMessage(err)}`);
              }
            }
          }

          if (detectedList.length === 0) {
            vscode.window.showInformationMessage(
              "Nenhum módulo detectado nos arquivos da pasta de origem.",
            );
            return;
          }

          progress.report({
            message: `${detectedList.length} módulo(s) encontrados. Aguardando seleção...`,
          });

          const quickPickItems = detectedList.map((d) => ({
            label: d.modName,
            description: `Origem: ${path.basename(d.sourcePath)} (${d.type === "bas" ? "bas" : "7proj"})`,
            detail: d.sourcePath,
            moduleData: d,
          }));

          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: "Selecione os módulos que deseja importar/aprovar para o repositório",
            canPickMany: true,
            ignoreFocusOut: true,
          });

          if (!selected || selected.length === 0) return;

          const selectedNames = new Set<string>();
          const duplicates = new Set<string>();
          for (const item of selected) {
            const nameLower = item.moduleData.modName.toLowerCase();
            if (selectedNames.has(nameLower)) duplicates.add(item.moduleData.modName);
            selectedNames.add(nameLower);
          }

          if (duplicates.size > 0) {
            vscode.window.showErrorMessage(
              `Importação cancelada. Você selecionou múltiplas fontes para o(s) mesmo(s) módulo(s): ${Array.from(duplicates).join(", ")}. Escolha apenas uma fonte por módulo.`,
            );
            return;
          }

          let count = 0;
          for (const item of selected) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (token.isCancellationRequested) break;
            const d = item.moduleData;
            this.writeModuleFile(d.modName, d.code);
            count++;
          }

          vscode.window.showInformationMessage(
            `${count} módulo(s) importados e limpos com sucesso no repositório.`,
          );
        } catch (err: unknown) {
          const message = errorMessage(err);
          logger.error("Falha em bulkImport", err);
          vscode.window.showErrorMessage(`Erro ao realizar varredura/importação: ${message}`);
        }
      },
    );
  }

  public async exploreRepository(): Promise<void> {
    let files: string[] = [];
    try {
      files = fs.readdirSync(this.repoBasPath).filter((f) => f.toLowerCase().endsWith(".bas"));
    } catch (err: unknown) {
      const message = errorMessage(err);
      logger.error("Falha ao ler repositório", err);
      vscode.window.showErrorMessage(`Erro ao ler repositório: ${message}`);
      return;
    }

    if (files.length === 0) {
      vscode.window.showInformationMessage("Nenhum módulo encontrado no repositório.");
      return;
    }

    const quickPickItems = files.map((file) => {
      const filePath = path.join(this.repoBasPath, file);
      let preview = "";
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        preview = lines
          .filter((l) => l.trim().length > 0)
          .slice(0, 3)
          .join(" | ");
      } catch {
        // Best-effort preview; ignore IO errors.
      }
      return {
        label: path.basename(file, ".bas"),
        description: file,
        detail: preview || filePath,
        filePath,
      };
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Selecione o módulo do repositório para gerenciar",
      ignoreFocusOut: true,
    });
    if (!selected) return;

    const action = await vscode.window.showQuickPick(
      ["Abrir arquivo para Visualizar/Editar", "Excluir Módulo do Repositório"],
      {
        placeHolder: `Ação para o módulo "${selected.label}"`,
        ignoreFocusOut: true,
      },
    );
    if (!action) return;

    if (action === "Abrir arquivo para Visualizar/Editar") {
      const doc = await vscode.workspace.openTextDocument(selected.filePath);
      await vscode.window.showTextDocument(doc);
    } else if (action === "Excluir Módulo do Repositório") {
      if (!ensureWorkspaceTrusted("Exclusão no repositório requer um workspace confiável.")) return;
      const confirm = await vscode.window.showWarningMessage(
        `Deseja realmente excluir o módulo "${selected.label}" do repositório?`,
        { modal: true },
        "Sim",
        "Não",
      );
      if (confirm === "Sim") {
        try {
          // Re-validate the path against the repository root before unlinking.
          const safePath = safeJoinInside(this.repoBasPath, path.basename(selected.filePath));
          fs.unlinkSync(safePath);
          vscode.window.showInformationMessage(
            `Módulo "${selected.label}" excluído do repositório.`,
          );
        } catch (err: unknown) {
          const message = errorMessage(err);
          logger.error(`Falha ao excluir módulo ${selected.label}`, err);
          vscode.window.showErrorMessage(`Erro ao excluir módulo: ${message}`);
        }
      }
    }
  }

  /**
   * Writes a `.bas` module into the repository, guarding against malicious
   * names parsed from untrusted XML.
   */
  private writeModuleFile(rawModName: string, content: string): void {
    if (!isSafeSegment(`${rawModName}.bas`)) {
      throw new Error(`Nome de módulo rejeitado por conter caracteres inválidos: "${rawModName}".`);
    }
    const destPath = safeJoinInside(this.repoBasPath, `${rawModName}.bas`);
    fs.writeFileSync(destPath, content, "utf-8");
  }
}

function ensureWorkspaceTrusted(reason: string): boolean {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage(reason);
    return false;
  }
  return true;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Erro desconhecido.";
}
