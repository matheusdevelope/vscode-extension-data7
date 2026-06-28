import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  BuildCache,
  PROJECT_CONFIG_FILENAME,
  getRawConfiguration,
  logger,
  readConfiguration,
  readProjectConfig,
} from "@data7/core";
import type { BuildProjectOptions, EnsureProjectBuiltResult } from "@data7/core";

import { DependencyService } from "./dependency-service";
import { ProjectService } from "./project-service";

import { WorkspaceTrustService } from "./workspace-trust-service";
import { WorkspaceFixService } from "./workspace-fix-service";
import { DiagnosticService } from "./diagnostic-service";

interface ExecutorLogSession {
  readonly filePath: string;
}

interface RunProjectFileOptions {
  readonly connectionId?: string;
  readonly companyCode?: number;
  readonly branchCode?: number;
  readonly userName?: string;
}

let executorLogSession: ExecutorLogSession | undefined;
let executorLogChannel: vscode.OutputChannel | undefined;

const EXECUTOR_LOG_CHANNEL_NAME = "Data7 Logs";

export class BuildService {
  public static _spawn = spawn;
  public static _getFreshProjectBuild = (
    workspaceDir: string,
    outputFilePath: string,
    options?: BuildProjectOptions,
  ): EnsureProjectBuiltResult | undefined =>
    BuildCache.getFreshProjectBuild(workspaceDir, outputFilePath, options);
  public static _ensureProjectBuilt = (
    workspaceDir: string,
    outputFilePath: string,
    options?: BuildProjectOptions,
  ): EnsureProjectBuiltResult =>
    BuildCache.ensureProjectBuilt(workspaceDir, outputFilePath, options);
  public static _resetExecutorLogState(): void {
    if (executorLogSession) {
      fs.unwatchFile(executorLogSession.filePath);
      executorLogSession = undefined;
    }
    executorLogChannel?.dispose();
    executorLogChannel = undefined;
  }

  /** Builds the active project's `.7Proj`. */
  public static async build(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Compilar um projeto Data7 requer um workspace confiável.",
      )
    ) {
      return;
    }

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
      async () => {
        try {
          await this.applyAutoFixBeforeBuild(project.workspaceDir);

          const dependencies = this.readDependencies(project.workspaceDir);
          DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);

          const result = this._ensureProjectBuilt(project.workspaceDir, project.projectFilePath);
          vscode.window.showInformationMessage(
            result.skipped
              ? `Projeto já está atualizado: ${project.projectFilePath}`
              : `Projeto compilado com sucesso em: ${project.projectFilePath}`,
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error("Falha ao compilar.", err);
          vscode.window.showErrorMessage(`Erro ao compilar: ${message}`);
        }
      },
    );
  }

  /** Runs the Data7 Executor against the current project. */
  public static async run(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Executar um projeto Data7 requer um workspace confiável.",
      )
    ) {
      return;
    }

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

    await ProjectService.verifyProjectConnection(project.workspaceDir, project.projectFilePath);

    let runOptions: RunProjectFileOptions = {};
    let dependencies: Record<string, string> = {};
    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    try {
      const cfg = readProjectConfig(configJsonPath);
      if (cfg) {
        runOptions = {
          connectionId: cfg.databaseConnectionId,
          companyCode: cfg.opcoes.codEmpresa,
          branchCode: cfg.opcoes.codFilial,
          userName: cfg.opcoes.nomeUsuario,
        };
        dependencies = { ...cfg.dependencies };
      }
    } catch (err) {
      logger.warn(
        `Falha ao ler data7.json antes da execução: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    let connectionId = runOptions.connectionId?.trim() ?? "";
    if (!connectionId) {
      connectionId = readConfiguration().databaseConnectionId.trim();
    }
    if (!connectionId) {
      vscode.window.showErrorMessage(
        "ID de conexão do banco de dados é obrigatório para execução. Atualize o campo opcoes.identificacaoBancoDados em data7.json.",
      );
      return;
    }
    runOptions = { ...runOptions, connectionId };

    const vscodeLoggerFilePath = this.prepareVSCodeLoggerFile(project.workspaceDir);
    const runProjectFilePath = this.getRunProjectFilePath(
      project.workspaceDir,
      project.projectFilePath,
    );

    try {
      await this.applyAutoFixBeforeBuild(project.workspaceDir);
      DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);
      const lintSummary = await DiagnosticService.lintWorkspaceForRun(project.workspaceDir);
      if (lintSummary.errorCount > 0) {
        vscode.window.showErrorMessage(
          `Execução cancelada. O linter encontrou ${lintSummary.errorCount} erro(s) no projeto.`,
        );
        return;
      }
      this._ensureProjectBuilt(project.workspaceDir, runProjectFilePath, {
        vscodeLoggerFilePath,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha na compilação antes de executar.", err);
      vscode.window.showErrorMessage(`Falha na compilação antes de executar: ${message}`);
      return;
    }

    this.startVSCodeLoggerMirror(vscodeLoggerFilePath);
    await this.runProjectFileDirectly(runProjectFilePath, runOptions);
  }

  /** Runs the Executor against a specific `.7Proj` file path. */
  public static async runProjectFileDirectly(
    projectFilePath: string,
    options: RunProjectFileOptions = {},
  ): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Executar um projeto Data7 requer um workspace confiável.",
      )
    ) {
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
    if (!fs.existsSync(executorPath)) {
      vscode.window.showErrorMessage(
        "O Executor.exe configurado não foi encontrado. Revise data7.executorPath.",
      );
      return;
    }

    const config = readConfiguration();
    let connectionId = options.connectionId?.trim() ?? config.databaseConnectionId.trim();
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
      String(options.companyCode ?? config.companyCode),
      "-f",
      String(options.branchCode ?? config.branchCode),
      "-u",
      options.userName ?? config.userName,
      "-p",
      projectFilePath,
    ];

    const child = this._spawn(executorPath, args, {
      cwd: path.dirname(projectFilePath),
      env: this.createExecutorEnvironment(executorPath),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.appendExecutorLogLine(`Executor iniciado para "${path.basename(projectFilePath)}".`);
    child.stdout.on("data", (chunk: Buffer) => {
      this.appendExecutorLog(chunk.toString("utf-8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.appendExecutorLog(chunk.toString("utf-8"));
    });
    child.once("error", (err: Error) => {
      this.appendExecutorLogLine(`Falha ao iniciar o Executor Data7: ${err.message}`);
      void vscode.window.showErrorMessage("Falha ao executar o projeto Data7.");
    });
    child.once("close", (code: number | null) => {
      if (code === 0) {
        this.appendExecutorLogLine(`Executor concluído para "${path.basename(projectFilePath)}".`);
      } else {
        this.appendExecutorLogLine(`Executor terminou com código ${code ?? "desconhecido"}.`);
      }
    });
  }

  /** Opens the active project in the Data7 Developer Studio. */
  public static async openInDevStudio(): Promise<void> {
    if (
      !WorkspaceTrustService.ensureTrusted(
        "Abrir no Developer Studio requer um workspace confiável.",
      )
    ) {
      return;
    }

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

    if (this._getFreshProjectBuild(project.workspaceDir, project.projectFilePath)) {
      await this.openInDevStudioDirectly(project.projectFilePath);
      return;
    }

    try {
      await this.applyAutoFixBeforeBuild(project.workspaceDir);
      const dependencies = this.readDependencies(project.workspaceDir);
      DependencyService.syncProjectData7Modules(project.workspaceDir, dependencies);
      this._ensureProjectBuilt(project.workspaceDir, project.projectFilePath);
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

  private static async applyAutoFixBeforeBuild(workspaceDir: string): Promise<void> {
    if (!readConfiguration().features.build.autoFixBeforeBuild) return;
    await WorkspaceFixService.fixWorkspaceForBuild(workspaceDir, { mode: "changed" });
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

  private static getRunProjectFilePath(workspaceDir: string, projectFilePath: string): string {
    const projectName = path.basename(projectFilePath, path.extname(projectFilePath));
    return path.join(workspaceDir, ".data7", "run", `${projectName}.run.7Proj`);
  }

  private static startVSCodeLoggerMirror(logFilePath: string): void {
    if (executorLogSession) {
      fs.unwatchFile(executorLogSession.filePath);
    }

    const channel = this.getExecutorLogChannel();
    this.appendExecutorLogLine("");
    this.appendExecutorLogLine(`===== Execução iniciada em ${new Date().toLocaleString()} =====`);
    channel.show(true);
    executorLogSession = { filePath: logFilePath };

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
          if (text.length > 0) this.appendExecutorLog(text);
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

  private static getExecutorLogChannel(): vscode.OutputChannel {
    executorLogChannel ??= vscode.window.createOutputChannel(EXECUTOR_LOG_CHANNEL_NAME);
    return executorLogChannel;
  }

  private static appendExecutorLog(text: string): void {
    if (!text) return;
    const channel = this.getExecutorLogChannel();
    channel.append(text);
    channel.show(true);
  }

  private static appendExecutorLogLine(text: string): void {
    const channel = this.getExecutorLogChannel();
    channel.appendLine(text);
    channel.show(true);
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
