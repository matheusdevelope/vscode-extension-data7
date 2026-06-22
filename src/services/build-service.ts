import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { Builder } from "../project/builder";
import { DependencyService } from "./dependency-service";
import { ProjectService } from "./project-service";
import { logger } from "../infra/logger";
import { readConfiguration, getRawConfiguration } from "../infra/configuration";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";
import { readProjectConfig } from "../project/project-config";
import { WorkspaceTrustService } from "./workspace-trust-service";

interface ExecutorLogSession {
  readonly filePath: string;
  readonly channel: vscode.OutputChannel;
}

let executorLogSession: ExecutorLogSession | undefined;

export class BuildService {
  public static _spawn = spawn;

  /** Builds the active project's `.7Proj`. */
  public static async build(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Compilar um projeto Data7 requer um workspace confiável.",
      )
    )
      {return;}

    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado na IDE. Abra um arquivo .bas de um projeto para compilar.",
      );
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Compilando e empacotando projeto...",
        cancellable: false,
      },
      () =>
        Promise.resolve().then(() => {
          try {
            const dependencies = this.readDependencies(project.workspaceDir);
            DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);

            Builder.buildProject(project.workspaceDir, project.projectFilePath);
            vscode.window.showInformationMessage(
              `Projeto compilado com sucesso em: ${project.projectFilePath}`,
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("Falha ao compilar.", err);
            vscode.window.showErrorMessage(`Erro ao compilar: ${message}`);
          }
        }),
    );
  }

  /** Runs the Data7 Executor against the current project. */
  public static async run(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Executar um projeto Data7 requer um workspace confiável.",
      )
    )
      {return;}

    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado para executar. Abra um arquivo .bas do projeto.",
      );
      return;
    }

    const cfg = getRawConfiguration();
    const executorPath = await ProjectService.ensureExecutorPath(cfg);
    if (!executorPath) {
      vscode.window.showErrorMessage(
        "Execução cancelada. O caminho do Executor.exe é obrigatório.",
      );
      return;
    }

    let dbIdFromProject = "";
    let dependencies: Record<string, string> = {};
    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    try {
      const cfg = readProjectConfig(configJsonPath);
      if (cfg) {
        dbIdFromProject = cfg.databaseConnectionId;
        dependencies = { ...cfg.dependencies };
      }
    } catch (err) {
      logger.warn(
        `Falha ao ler data7.json antes da execução: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let { databaseConnectionId: connectionId } = readConfiguration();
    if (!connectionId) connectionId = dbIdFromProject;
    if (!connectionId) {
      const input = await vscode.window.showInputBox({
        prompt: "Informe o ID de conexão com o banco de dados (UUID-CONEXAO):",
        placeHolder: "Ex: 05B54E6D-D75B-4A7F-9943-5521A91747C9",
        ignoreFocusOut: true,
      });
      if (input) {
        connectionId = input;
        await cfg.update(
          "databaseConnectionId",
          connectionId,
          vscode.ConfigurationTarget.Workspace,
        );
      } else {
        vscode.window.showErrorMessage(
          "ID de conexão do banco de dados é obrigatório para execução.",
        );
        return;
      }
    }

    const vscodeLoggerFilePath = this.prepareVSCodeLoggerFile(project.workspaceDir);

    try {
      DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);
      Builder.buildProject(project.workspaceDir, project.projectFilePath, undefined, {
        vscodeLoggerFilePath,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha na compilação antes de executar.", err);
      vscode.window.showErrorMessage(`Falha na compilação antes de executar: ${message}`);
      return;
    }

    this.startVSCodeLoggerMirror(vscodeLoggerFilePath);
    await this.runProjectFileDirectly(project.projectFilePath);
  }

  /** Runs the Executor against a specific `.7Proj` file path. */
  public static async runProjectFileDirectly(projectFilePath: string): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Executar um projeto Data7 requer um workspace confiável.",
      )
    )
      {return;}

    const cfg = getRawConfiguration();
    const executorPath = await ProjectService.ensureExecutorPath(cfg);
    if (!executorPath) {
      vscode.window.showErrorMessage(
        "Execução cancelada. O caminho do Executor.exe é obrigatório.",
      );
      return;
    }
    if (!fs.existsSync(executorPath)) {
      vscode.window.showErrorMessage(
        "O Executor.exe configurado não foi encontrado. Revise data7.executorPath.",
      );
      return;
    }

    const config = readConfiguration();
    let connectionId = config.databaseConnectionId;
    if (!connectionId) {
      const input = await vscode.window.showInputBox({
        prompt: "Informe o ID de conexão com o banco de dados (UUID-CONEXAO):",
        placeHolder: "Ex: 05B54E6D-D75B-4A7F-9943-5521A91747C9",
        ignoreFocusOut: true,
      });
      if (input) {
        connectionId = input;
        await cfg.update(
          "databaseConnectionId",
          connectionId,
          vscode.ConfigurationTarget.Workspace,
        );
      } else {
        vscode.window.showErrorMessage(
          "ID de conexão do banco de dados é obrigatório para execução.",
        );
        return;
      }
    }

    const args = [
      "-c",
      connectionId,
      "-e",
      String(config.companyCode),
      "-f",
      String(config.branchCode),
      "-u",
      config.userName,
      "-p",
      projectFilePath,
    ];

    const child = this._spawn(executorPath, args, {
      cwd: path.dirname(projectFilePath),
      env: this.createExecutorEnvironment(executorPath),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk: Buffer) => {
      logger.info(`[Executor] ${chunk.toString("utf-8").trimEnd()}`);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      logger.error(`[Executor] ${chunk.toString("utf-8").trimEnd()}`);
    });
    child.once("error", (err: Error) => {
      logger.error("Falha ao iniciar o Executor Data7.", err);
      void vscode.window.showErrorMessage("Falha ao executar o projeto Data7.");
    });
    child.once("close", (code: number | null) => {
      if (code === 0) {
        logger.info(`Executor concluído para "${path.basename(projectFilePath)}".`);
      } else {
        logger.warn(`Executor terminou com código ${code ?? "desconhecido"}.`);
      }
    });

    logger.info(`Executor iniciado para "${path.basename(projectFilePath)}".`);
    logger.show();
  }

  /** Opens the active project in the Data7 Developer Studio. */
  public static async openInDevStudio(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Abrir no Developer Studio requer um workspace confiável.",
      )
    )
      {return;}

    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage("Nenhum projeto Data7 ativo detectado na IDE.");
      return;
    }

    const { executorPath } = readConfiguration();
    if (!executorPath || !fs.existsSync(executorPath)) {
      vscode.window.showErrorMessage(
        "Caminho do Executor.exe não configurado ou inválido nas configurações.",
      );
      return;
    }

    try {
      const dependencies = this.readDependencies(project.workspaceDir);
      DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);
      Builder.buildProject(project.workspaceDir, project.projectFilePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha ao compilar antes de abrir no Developer Studio.", err);
      vscode.window.showErrorMessage(
        `Falha ao compilar o projeto antes de abrir no Developer Studio: ${message}`,
      );
      return;
    }

    await this.openInDevStudioDirectly(project.projectFilePath);
  }

  public static openInDevStudioDirectly(projectFilePath: string): Promise<void> {
    // No async work happens here, but the public API is `Promise<void>` so
    // callers can `await` consistently across all BuildService entry points.
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Abrir no Developer Studio requer um workspace confiável.",
      )
    ) {
      return Promise.resolve();
    }

    const { executorPath } = readConfiguration();
    if (!executorPath || !fs.existsSync(executorPath)) {
      vscode.window.showErrorMessage(
        "Caminho do Executor.exe não configurado ou inválido nas configurações.",
      );
      return Promise.resolve();
    }

    const executorDir = path.dirname(executorPath);
    const devStudioPath = path.join(executorDir, "DevStudio.exe");
    if (!fs.existsSync(devStudioPath)) {
      vscode.window.showErrorMessage(`DevStudio.exe não foi encontrado na pasta "${executorDir}".`);
      return Promise.resolve();
    }

    vscode.window.showInformationMessage(
      `Abrindo "${path.basename(projectFilePath)}" no Developer Studio...`,
    );

    // spawn with explicit argument array; detached + unref so the child outlives us.
    const child = this._spawn(devStudioPath, [projectFilePath], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Erro ao executar o Developer Studio.", err);
      vscode.window.showErrorMessage(`Erro ao executar o Developer Studio: ${message}`);
    });
    child.unref();
    return Promise.resolve();
  }

  private static readDependencies(workspaceDir: string): Record<string, string> {
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    try {
      const cfg = readProjectConfig(configJsonPath);
      return cfg ? { ...cfg.dependencies } : {};
    } catch (err) {
      logger.warn(
        `Falha ao ler dependências em ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {};
    }
  }

  private static prepareVSCodeLoggerFile(workspaceDir: string): string {
    const logsDir = path.join(workspaceDir, ".data7", "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, "vscode-executor.log");
    fs.writeFileSync(logFilePath, "", "utf-8");
    return logFilePath;
  }

  private static startVSCodeLoggerMirror(logFilePath: string): void {
    if (executorLogSession) {
      fs.unwatchFile(executorLogSession.filePath);
      executorLogSession.channel.dispose();
    }

    const channel = vscode.window.createOutputChannel("Data7 Executor Logs");
    channel.clear();
    channel.show(true);
    executorLogSession = { filePath: logFilePath, channel };

    let offset = 0;
    const readNewContent = (): void => {
      try {
        if (!fs.existsSync(logFilePath)) return;
        const stat = fs.statSync(logFilePath);
        if (stat.size < offset) offset = 0;
        if (stat.size === offset) return;

        const fd = fs.openSync(logFilePath, "r");
        try {
          const buffer = Buffer.alloc(stat.size - offset);
          fs.readSync(fd, buffer, 0, buffer.length, offset);
          offset = stat.size;
          const text = buffer.toString("utf-8");
          if (text.length > 0) channel.append(text);
        } finally {
          fs.closeSync(fd);
        }
      } catch (err: unknown) {
        logger.warn(
          `Falha ao espelhar logs do Executor no VS Code: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    };

    fs.watchFile(logFilePath, { interval: 250 }, readNewContent);
  }

  private static createExecutorEnvironment(executorPath: string): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH ?? path.dirname(executorPath),
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
    };
  }
}
