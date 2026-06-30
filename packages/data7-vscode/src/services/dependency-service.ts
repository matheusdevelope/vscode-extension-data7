import * as vscode from "vscode";
import { ProjectService } from "./project-service";
import { DiagnosticService } from "./diagnostic-service";
import {
  Builder,
  PROJECT_CONFIG_FILENAME,
  WorkspaceSymbolIndexer,
  logger,
  ModuleOrchestrator,
  type ModuleOperationResult,
} from "@data7/core";
import * as path from "path";
import * as fs from "fs";

export interface DependencyDetectionResult {
  synced: string[];
  missing: string[];
}

export class DependencyService {
  public static syncProjectData7Modules(
    workspaceDir: string,
    dependencies?: Record<string, string>,
  ): string[] {
    // Deprecated. Logic moved to the Package Manager.
    return [];
  }

  public static async detectAndSyncProjectDependencies(
    workspaceDir: string,
    opts: { silent?: boolean } = {},
  ): Promise<DependencyDetectionResult> {
    // Deprecated. Auto-scan is disabled. Returns empty results to satisfy old callers.
    return { synced: [], missing: [] };
  }

  public static async refreshActiveProject(opts: { silent?: boolean } = {}): Promise<void> {
    // Minimal refresh without auto-syncing
    const project = ProjectService.getActiveProject();
    if (!project) return;

    try {
      Builder.buildProject(project.workspaceDir, project.projectFilePath);
      const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
      if (fs.existsSync(data7ModulesDir)) {
        await WorkspaceSymbolIndexer.getInstance().indexDirectory(data7ModulesDir);
      }
      DiagnosticService.refreshAllActive();
    } catch (err) {
      logger.error("Falha ao atualizar projeto.", err);
    }
  }

  public static scheduleWorkspaceDependencyRefresh(workspaceDir: string): void {
    // Deprecated. No auto-refresh based on typing anymore.
  }

  public static async refreshWorkspaceDependencies(
    workspaceDir: string,
  ): Promise<DependencyDetectionResult> {
    // Deprecated.
    return { synced: [], missing: [] };
  }

  public static async installModule(moduleName?: string): Promise<void> {
    if (!moduleName) {
      moduleName = await vscode.window.showInputBox({
        prompt: "Digite o nome do módulo a ser instalado",
        placeHolder: "ex: mod_buttonedtextbox",
      });
    }
    if (!moduleName) return;

    await this.installModules([moduleName]);
  }

  public static async installModules(moduleNames: string[]): Promise<void> {
    await this.runModuleOperation(
      "Instalando módulos...",
      async (workspaceDir) => ModuleOrchestrator.installModules(workspaceDir, moduleNames),
      "instalados",
    );
  }

  public static async updateModules(moduleNames?: string[]): Promise<void> {
    await this.runModuleOperation(
      moduleNames && moduleNames.length > 0
        ? "Atualizando módulos..."
        : "Atualizando dependências...",
      async (workspaceDir) => ModuleOrchestrator.updateModules(workspaceDir, moduleNames),
      "atualizados",
    );
  }

  public static async removeModules(moduleNames: string[]): Promise<void> {
    await this.runModuleOperation(
      "Removendo módulos...",
      async (workspaceDir) => ModuleOrchestrator.removeModules(workspaceDir, moduleNames),
      "removidos",
    );
  }

  private static async runModuleOperation(
    title: string,
    operation: (workspaceDir: string) => Promise<ModuleOperationResult>,
    doneLabel: string,
  ): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("Nenhum projeto ativo. Abra um projeto Data7 primeiro.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false,
      },
      async () => {
        try {
          const result = await operation(project.workspaceDir);
          const changed = [...result.installed, ...result.updated, ...result.removed];
          if (changed.length > 0) {
            vscode.window.showInformationMessage(`Módulos ${doneLabel}: ${changed.join(", ")}`);
          } else if (result.synced.length > 0) {
            vscode.window.showInformationMessage(
              `Módulos sincronizados: ${result.synced.join(", ")}`,
            );
          } else {
            vscode.window.showInformationMessage("Nenhum módulo precisou ser alterado.");
          }
          if (result.missing.length > 0) {
            vscode.window.showWarningMessage(
              `Módulos não encontrados: ${result.missing.join(", ")}`,
            );
          }
          await this.refreshActiveProject();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Falha ao gerenciar módulos: ${message}`);
        }
      },
    );
  }

  public static async updateDependencies(): Promise<void> {
    await this.updateModules();
  }

  public static async publishModule(): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("Nenhum projeto ativo.");
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Publicando módulo localmente...",
        cancellable: false,
      },
      async () => {
        try {
          await ModuleOrchestrator.publishModuleLocally(project.workspaceDir);
          vscode.window.showInformationMessage("Módulo publicado localmente com sucesso!");
        } catch (err: any) {
          vscode.window.showErrorMessage(`Falha ao publicar módulo: ${err.message}`);
        }
      },
    );
  }
}
