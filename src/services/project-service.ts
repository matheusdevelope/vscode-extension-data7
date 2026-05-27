import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { Builder } from "../project/builder";
import { Decompiler } from "../project/decompiler";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { RepositoryService } from "./repository-service";
import { DependencyService } from "./dependency-service";
import { generateProjectGuid } from "../utils/guid";
import { isXmlRecord, parseProjectXml, xmlRecord } from "../utils/xml-helpers";

/**
 * Returns the first non-empty record under one of the candidate keys.
 * Returns undefined if none of them produce a record with at least one own key.
 */
function pickFirstRecord(
  parent: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const rec = xmlRecord(parent, key);
    if (Object.keys(rec).length > 0) return rec;
  }
  return undefined;
}
import { logger } from "../infra/logger";
import { readConfiguration } from "../infra/configuration";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";

export interface DbConnection {
  id: string;
  desc: string;
}

export interface ProjectPaths {
  workspaceDir: string;
  projectFilePath: string;
}

export class ProjectService {
  /**
   * Walks upward from a file path looking for a `data7.json`. Returns the
   * project workspace directory and the resolved `.7Proj` file path when found.
   */
  public static findProjectPaths(filePath: string): ProjectPaths | undefined {
    let currentDir = path.dirname(filePath);
    const root = path.parse(currentDir).root;

    while (currentDir && currentDir !== root) {
      const configPath = path.join(currentDir, PROJECT_CONFIG_FILENAME);
      if (fs.existsSync(configPath)) {
        return this.resolveProjectPaths(currentDir, configPath);
      }
      currentDir = path.dirname(currentDir);
    }
    return undefined;
  }

  /**
   * Returns the project paths for the active editor, falling back to the
   * first workspace folder when no editor is active.
   */
  public static getActiveProject(): ProjectPaths | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const paths = this.findProjectPaths(activeEditor.document.fileName);
      if (paths) return paths;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const workspaceDir = folders[0].uri.fsPath;
      const configPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
      if (fs.existsSync(configPath)) {
        return this.resolveProjectPaths(workspaceDir, configPath);
      }
    }
    return undefined;
  }

  private static resolveProjectPaths(workspaceDir: string, configPath: string): ProjectPaths {
    try {
      const files = fs.readdirSync(workspaceDir);
      const projFile = files.find((f) => f.toLowerCase().endsWith(".7proj"));
      if (projFile) {
        return { workspaceDir, projectFilePath: path.join(workspaceDir, projFile) };
      }
      const meta: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const projName =
        (isRecord(meta) && typeof meta.nome === "string" && meta.nome) ||
        path.basename(workspaceDir);
      return { workspaceDir, projectFilePath: path.join(workspaceDir, `${projName}.7Proj`) };
    } catch {
      const projName = path.basename(workspaceDir);
      return { workspaceDir, projectFilePath: path.join(workspaceDir, `${projName}.7Proj`) };
    }
  }

  /**
   * Configuration helper to ensure Executor.exe path is configured.
   */
  public static async ensureExecutorPath(
    config: vscode.WorkspaceConfiguration,
  ): Promise<string | undefined> {
    let executorPath = config.get<string>("executorPath") ?? "";
    if (!executorPath || executorPath.includes("[Executor.exe") || !fs.existsSync(executorPath)) {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { Executáveis: ["exe"] },
        title: "Selecione o arquivo do Executor do Data7 (Executor.exe)",
      });
      if (selected && selected.length > 0) {
        executorPath = selected[0].fsPath;
        await config.update("executorPath", executorPath, vscode.ConfigurationTarget.Global);
      } else {
        return undefined;
      }
    }
    return executorPath;
  }

  /** Adds `data7_modules/` to `.gitignore` in the project directory. */
  public static protectProjectFolder(workspaceDir: string): Promise<void> {
    // Synchronous I/O wrapped in a Promise so the API stays awaitable for
    // consistency with the rest of ProjectService.
    return Promise.resolve().then(() => {
      const gitignorePath = path.join(workspaceDir, ".gitignore");
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(
          gitignorePath,
          `# Módulos de dependências do Data7\ndata7_modules/\n`,
          "utf-8",
        );
        return;
      }
      try {
        const content = fs.readFileSync(gitignorePath, "utf-8");
        if (!content.includes("data7_modules/")) {
          fs.appendFileSync(
            gitignorePath,
            `\n# Módulos de dependências do Data7\ndata7_modules/\n`,
            "utf-8",
          );
        }
      } catch (err) {
        logger.warn(
          `Não foi possível atualizar .gitignore: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  /**
   * Loads available database connections from the Data7 Executor config file.
   */
  public static loadAvailableConnections(): DbConnection[] {
    const { executorPath } = readConfiguration();
    let executorDir = "";

    if (executorPath && !executorPath.includes("[Executor.exe") && fs.existsSync(executorPath)) {
      executorDir = path.dirname(executorPath);
    } else {
      const fallbackDir = "C:\\Data7\\bin";
      if (fs.existsSync(fallbackDir)) {
        executorDir = fallbackDir;
      }
    }

    if (!executorDir) {
      logger.info("Pasta do executor do Data7 não encontrada ou não configurada.");
      return [];
    }

    let configFile = path.join(executorDir, "dataset.config");
    if (!fs.existsSync(configFile)) {
      configFile = path.join(executorDir, "Data7.Config");
    }
    if (!fs.existsSync(configFile)) {
      logger.info(`Nenhum arquivo de configuração de conexões encontrado em ${executorDir}`);
      return [];
    }

    try {
      const xml = fs.readFileSync(configFile, "utf-8");
      const parsed = parseProjectXml(xml);
      const root: Record<string, unknown> = isXmlRecord(parsed)
        ? (pickFirstRecord(parsed, ["Configurações", "Configuracoes"]) ?? parsed)
        : {};
      const itemsRaw = root.Item;
      if (!itemsRaw) return [];
      const itemList = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];

      const connections: DbConnection[] = [];
      for (const item of itemList) {
        if (!isXmlRecord(item)) continue;
        const id =
          (typeof item["@_ID"] === "string" ? item["@_ID"] : undefined) ??
          (typeof item.ID === "string" ? item.ID : undefined);
        const desc =
          (typeof item["Descrição"] === "string" ? item["Descrição"] : undefined) ??
          (typeof item.Descricao === "string" ? item.Descricao : "");
        if (id) {
          connections.push({ id: id.trim(), desc: desc.trim() });
        }
      }
      return connections;
    } catch (err: unknown) {
      logger.error(`Erro ao ler conexões de banco de dados em ${configFile}`, err);
      return [];
    }
  }

  /**
   * Verifies the project's database connection ID. Prompts the user when invalid.
   */
  public static async verifyProjectConnection(
    workspaceDir: string,
    projectFilePath: string,
  ): Promise<void> {
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configJsonPath)) return;

    const connections = this.loadAvailableConnections();
    if (connections.length === 0) return;

    let projectMeta: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
      projectMeta = isRecord(parsed) ? parsed : {};
    } catch (err: unknown) {
      logger.error("Erro ao ler data7.json.", err);
      return;
    }

    const opcoes = isRecord(projectMeta.opcoes) ? projectMeta.opcoes : {};
    const rawDbId = opcoes.identificacaoBancoDados;
    const currentDbId = (typeof rawDbId === "string" ? rawDbId : "").trim().toLowerCase();
    const isValid = connections.some((conn) => conn.id.toLowerCase() === currentDbId);
    if (isValid) return;

    const quickPickItems = connections.map((conn) => ({
      label: conn.desc,
      description: conn.id,
      detail: `ID: ${conn.id}`,
    }));
    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder:
        "Selecione a conexão do banco de dados para este projeto (necessário para rodar/buildar)",
      ignoreFocusOut: true,
    });
    if (!selected) {
      vscode.window.showWarningMessage(
        "Nenhuma conexão com banco de dados foi selecionada. O projeto pode estar com ID inválido ou em branco.",
      );
      return;
    }

    const nextOpcoes: Record<string, unknown> = {
      ...opcoes,
      identificacaoBancoDados: selected.description,
    };
    projectMeta.opcoes = nextOpcoes;

    try {
      fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");
      Builder.buildProject(workspaceDir, projectFilePath);
      vscode.window.showInformationMessage(
        `Conexão com banco de dados atualizada para "${selected.label}" no projeto.`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Erro ao atualizar conexão do projeto.", err);
      vscode.window.showErrorMessage(`Erro ao atualizar conexão do projeto: ${message}`);
    }
  }

  /** Creates a new Data7 project on disk and opens it in VS Code. */
  public static async createNewProject(): Promise<void> {
    if (!ensureWorkspaceTrusted("Criar um novo projeto requer um workspace confiável.")) return;

    const projectName = await vscode.window.showInputBox({
      prompt: "Digite o nome do novo projeto:",
      placeHolder: "Ex: mod_logger",
      ignoreFocusOut: true,
      validateInput: (value: string) => {
        if (!value || value.trim() === "") return "O nome do projeto é obrigatório.";
        if (!/^[a-zA-Z0-9_]+$/.test(value)) {
          return "O nome do projeto deve conter apenas letras, números e sublinhados (_).";
        }
        return null;
      },
    });
    if (!projectName) return;

    const parentFolderSelection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: "Selecione a pasta mãe onde a pasta do projeto será criada",
    });
    if (!parentFolderSelection || parentFolderSelection.length === 0) return;
    const parentDir = parentFolderSelection[0].fsPath;
    const projectDir = path.join(parentDir, projectName);

    if (fs.existsSync(projectDir)) {
      vscode.window.showErrorMessage(
        `A pasta do projeto "${projectName}" já existe em "${parentDir}".`,
      );
      return;
    }

    const language = await vscode.window.showQuickPick(["Basic", "C#"], {
      placeHolder: "Selecione a linguagem do projeto:",
      ignoreFocusOut: true,
    });
    if (!language) return;

    const version = await vscode.window.showInputBox({
      prompt: "Digite a versão inicial do projeto:",
      value: "1.0.0.0",
      ignoreFocusOut: true,
    });
    if (!version) return;

    const author =
      (await vscode.window.showInputBox({
        prompt: "Digite o nome do Autor:",
        value: "Administrador",
        ignoreFocusOut: true,
      })) ?? "Administrador";

    const companyCodeStr =
      (await vscode.window.showInputBox({
        prompt: "Digite o código da Empresa:",
        value: "1",
        ignoreFocusOut: true,
      })) ?? "1";
    const companyCode = parseInt(companyCodeStr, 10) || 1;

    const branchCodeStr =
      (await vscode.window.showInputBox({
        prompt: "Digite o código da Filial:",
        value: "1",
        ignoreFocusOut: true,
      })) ?? "1";
    const branchCode = parseInt(branchCodeStr, 10) || 1;

    const connectionId =
      (await vscode.window.showInputBox({
        prompt: "Digite a identificação de Conexão com Banco de Dados (Opcional):",
        placeHolder: "Ex: UUID-CONEXAO",
        ignoreFocusOut: true,
      })) ?? "";

    try {
      fs.mkdirSync(projectDir, { recursive: true });
      const srcDir = path.join(projectDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });

      const defaultBasCode = `' Código Principal do Projeto: ${projectName}\r\nImports Collections\r\n\r\n' Ponto de entrada do script\r\n`;
      fs.writeFileSync(path.join(srcDir, "Principal.bas"), defaultBasCode, "utf-8");

      const configData = {
        nome: projectName,
        language,
        version,
        targetPlatform: "Default",
        opcoes: {
          autor: author,
          versao: version,
          informacoes: `Projeto ${projectName} criado no VS Code`,
          codEmpresa: companyCode,
          codFilial: branchCode,
          nomeUsuario: author,
          preScript: "",
          identificacaoBancoDados: connectionId,
        },
        virtualFolders: [
          { nome: "Unidades (1)", id: generateProjectGuid(), pastaId: "", aberta: "Sim" },
        ],
        modulesMetadata: {},
        dependencies: {},
      };

      fs.writeFileSync(
        path.join(projectDir, PROJECT_CONFIG_FILENAME),
        JSON.stringify(configData, null, 2),
        "utf-8",
      );
      await this.protectProjectFolder(projectDir);

      const projectFilePath = path.join(projectDir, `${projectName}.7Proj`);
      Builder.buildProject(projectDir, projectFilePath);

      vscode.window.showInformationMessage(`Projeto "${projectName}" criado com sucesso!`);
      await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir), {
        forceNewWindow: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha ao criar o novo projeto.", err);
      vscode.window.showErrorMessage(`Falha ao criar o novo projeto: ${message}`);
    }
  }

  /**
   * Opens an existing `.7Proj` file: optionally copies it to a destination folder,
   * decompiles it, syncs dependencies, and opens the resulting folder in VS Code.
   *
   * Extracted out of `extension.ts` so the command callback there stays thin.
   */
  public static async openProject(uri: vscode.Uri | undefined): Promise<void> {
    if (!ensureWorkspaceTrusted("Abrir e decompor um projeto requer um workspace confiável.")) {
      return;
    }

    let targetFile = uri?.fsPath;
    if (!targetFile) {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { "Data7 Project": ["7Proj"] },
        title: "Selecione o arquivo .7Proj do projeto para abrir",
      });
      if (selected && selected.length > 0) {
        targetFile = selected[0].fsPath;
      }
    }
    if (!targetFile) return;

    const projectDir = path.dirname(targetFile);
    const projectName = path.basename(targetFile, path.extname(targetFile));

    const destFolderSelection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title:
        "Selecione a pasta de destino (Opcional - Pressione ESC para usar a pasta atual do .7Proj)",
    });

    let workspaceDir = projectDir;
    let finalProjFile = targetFile;

    if (destFolderSelection && destFolderSelection.length > 0) {
      const selectedDestDir = destFolderSelection[0].fsPath;
      workspaceDir = path.join(selectedDestDir, projectName);
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }
      finalProjFile = path.join(workspaceDir, `${projectName}.7Proj`);
      try {
        fs.copyFileSync(targetFile, finalProjFile);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Falha ao copiar o arquivo .7Proj.", err);
        vscode.window.showErrorMessage(
          `Falha ao copiar o arquivo .7Proj para a nova pasta: ${message}`,
        );
        return;
      }
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Abrindo projeto '${projectName}'...`,
        cancellable: false,
      },
      async () => {
        try {
          const repoBasPath = RepositoryService.getRepoBasPath();
          let knownSharedModules: Set<string> | undefined;
          if (repoBasPath && fs.existsSync(repoBasPath)) {
            try {
              const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
              knownSharedModules = new Set(sharedModules.keys());
            } catch (err) {
              logger.warn(
                `Falha ao escanear módulos compartilhados: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }

          Decompiler.decompileProject(finalProjFile, workspaceDir, knownSharedModules);
          await this.protectProjectFolder(workspaceDir);

          let syncedCount = 0;
          if (repoBasPath && fs.existsSync(repoBasPath)) {
            const synced = await DependencyService.detectAndSyncProjectDependencies(workspaceDir);
            syncedCount = synced.length;
          }

          vscode.window.showInformationMessage(
            `Projeto '${projectName}' aberto com sucesso. ` +
              (syncedCount > 0 ? `${syncedCount} dependências sincronizadas.` : ""),
          );

          await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(workspaceDir), {
            forceNewWindow: false,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Erro ao abrir o projeto.", err);
          vscode.window.showErrorMessage(`Erro ao abrir o projeto: ${message}`);
        }
      },
    );
  }
}

function ensureWorkspaceTrusted(reason: string): boolean {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage(reason);
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
