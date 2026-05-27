import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { Builder } from "../project/builder";
import { DependencyScanner } from "../analysis/dependency-scanner";
import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { logger } from "../infra/logger";
import { readConfiguration, getRawConfiguration } from "../infra/configuration";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureWorkspaceTrusted(reason: string): boolean {
  if (!vscode.workspace.isTrusted) {
    vscode.window.showErrorMessage(reason);
    return false;
  }
  return true;
}

export class BuildService {
  /** Builds the active project's `.7Proj`. */
  public static async build(): Promise<void> {
    if (!ensureWorkspaceTrusted("Compilar um projeto Data7 requer um workspace confiável.")) return;

    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado na IDE. Abra um arquivo .bas de um projeto para compilar.",
      );
      return;
    }

    const repoBasPath = RepositoryService.getRepoBasPath();

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Compilando e empacotando projeto...",
        cancellable: false,
      },
      () =>
        Promise.resolve().then(() => {
          try {
            const srcDir = path.join(project.workspaceDir, "src");
            const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");

            const dependencies = this.readDependencies(project.workspaceDir);
            DependencyScanner.syncDependencies(srcDir, data7ModulesDir, repoBasPath, dependencies);

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
    if (!ensureWorkspaceTrusted("Executar um projeto Data7 requer um workspace confiável.")) return;

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

    const repoBasPath = RepositoryService.getRepoBasPath();

    let dbIdFromProject = "";
    let dependencies: Record<string, string> = {};
    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    if (fs.existsSync(configJsonPath)) {
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
        if (isRecord(parsed)) {
          const opcoes = isRecord(parsed.opcoes) ? parsed.opcoes : {};
          dbIdFromProject =
            typeof opcoes.identificacaoBancoDados === "string"
              ? opcoes.identificacaoBancoDados
              : "";
          if (isRecord(parsed.dependencies)) {
            dependencies = parsed.dependencies as Record<string, string>;
          }
        }
      } catch (err) {
        logger.warn(
          `Falha ao ler data7.json antes da execução: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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

    try {
      const srcDir = path.join(project.workspaceDir, "src");
      const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
      DependencyScanner.syncDependencies(srcDir, data7ModulesDir, repoBasPath, dependencies);
      Builder.buildProject(project.workspaceDir, project.projectFilePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha na compilação antes de executar.", err);
      vscode.window.showErrorMessage(`Falha na compilação antes de executar: ${message}`);
      return;
    }

    await this.runProjectFileDirectly(project.projectFilePath);
  }

  /** Runs the Executor against a specific `.7Proj` file path. */
  public static async runProjectFileDirectly(projectFilePath: string): Promise<void> {
    if (!ensureWorkspaceTrusted("Executar um projeto Data7 requer um workspace confiável.")) return;

    const cfg = getRawConfiguration();
    const executorPath = await ProjectService.ensureExecutorPath(cfg);
    if (!executorPath) {
      vscode.window.showErrorMessage(
        "Execução cancelada. O caminho do Executor.exe é obrigatório.",
      );
      return;
    }
    if (!fs.existsSync(executorPath)) {
      vscode.window.showErrorMessage(`Executor.exe não encontrado em "${executorPath}".`);
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

    // spawn with explicit argument array avoids shell-injection from user-controlled
    // executorPath / connectionId values (security.mdc).
    const args = [
      "-p",
      projectFilePath,
      "-U",
      String(config.userCode),
      "-E",
      String(config.companyCode),
      "-F",
      String(config.branchCode),
      "-C",
      connectionId,
    ];

    const terminalName = "Data7 Executor";
    const terminal =
      vscode.window.terminals.find((t) => t.name === terminalName) ??
      vscode.window.createTerminal(terminalName);
    terminal.show();
    terminal.sendText(this.formatCommandForTerminal(executorPath, args));

    logger.info(`Executor lançado para "${path.basename(projectFilePath)}".`);
  }

  /** Opens the active project in the Data7 Developer Studio. */
  public static async openInDevStudio(): Promise<void> {
    if (!ensureWorkspaceTrusted("Abrir no Developer Studio requer um workspace confiável.")) return;

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
      const srcDir = path.join(project.workspaceDir, "src");
      const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
      const dependencies = this.readDependencies(project.workspaceDir);
      const repoBasPath = RepositoryService.getRepoBasPath();
      if (repoBasPath && fs.existsSync(repoBasPath)) {
        DependencyScanner.syncDependencies(srcDir, data7ModulesDir, repoBasPath, dependencies);
      }
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
    if (!ensureWorkspaceTrusted("Abrir no Developer Studio requer um workspace confiável.")) {
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
    const child = spawn(devStudioPath, [projectFilePath], {
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
    if (!fs.existsSync(configJsonPath)) return {};
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
      if (isRecord(parsed) && isRecord(parsed.dependencies)) {
        return parsed.dependencies as Record<string, string>;
      }
    } catch (err) {
      logger.warn(
        `Falha ao ler dependências em ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return {};
  }

  /**
   * Formats the Executor invocation as a single shell line for the terminal.
   * Quotes every path/argument so spaces in user-controlled values do not break
   * argument boundaries. This is the same data we spawn with `args[]` but
   * routed through the integrated terminal so the user can see the output.
   */
  private static formatCommandForTerminal(executablePath: string, args: string[]): string {
    const quote = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;
    return [quote(executablePath), ...args.map(quote)].join(" ");
  }
}
