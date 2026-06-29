import * as vscode from "vscode";
import { ProjectService } from "./project-service";
import { DiagnosticService } from "./diagnostic-service";
import { 
  Builder, 
  PROJECT_CONFIG_FILENAME, 
  WorkspaceSymbolIndexer, 
  logger,
  readProjectConfig,
  writeProjectConfig,
  isRecord,
  DependencySynchronizer,
  ModuleOrchestrator
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
        placeHolder: "ex: mod_buttonedtextbox"
      });
    }
    if (!moduleName) return;

    await this.installModules([moduleName]);
  }

  public static async installModules(moduleNames: string[]): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("Nenhum projeto ativo. Abra um projeto Data7 primeiro.");
      return;
    }

    try {
      const manifestPath = path.join(project.workspaceDir, "data7.json");
      const manifest = readProjectConfig(manifestPath);
      if (!manifest) throw new Error("data7.json não encontrado no projeto ativo.");

      let changed = false;
      const rawDeps = (isRecord(manifest.raw.dependencies) ? { ...manifest.raw.dependencies } : {}) as Record<string, string>;
      for (const moduleName of moduleNames) {
        if (!rawDeps[moduleName]) {
          rawDeps[moduleName] = "latest";
          changed = true;
        }
      }

      if (changed) {
        const updatedMetadata = {
          ...manifest.raw,
          dependencies: rawDeps,
        };
        writeProjectConfig(manifestPath, updatedMetadata as any);
      }

      const synced = await DependencySynchronizer.sync(project.workspaceDir, changed ? rawDeps : manifest.dependencies);
      if (synced.length > 0) {
        vscode.window.showInformationMessage(`Módulos instalados/sincronizados: ${synced.join(", ")}`);
        this.refreshActiveProject();
      } else if (!changed) {
        vscode.window.showInformationMessage("Todos os módulos já estavam instalados e atualizados.");
      }
    } catch (err: any) {
      vscode.window.showErrorMessage(`Falha ao instalar módulos: ${err.message}`);
    }
  }

  public static async updateDependencies(): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showWarningMessage("Nenhum projeto ativo.");
      return;
    }

    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Sincronizando dependências do projeto...",
        cancellable: false,
      },
      async () => {
        try {
          const synced = await ModuleOrchestrator.syncDependencies(project.workspaceDir);
          vscode.window.showInformationMessage(
            synced.length > 0
              ? `Dependências sincronizadas: ${synced.length} módulo(s).`
              : "Nenhuma dependência precisou ser sincronizada."
          );
          this.refreshActiveProject();
        } catch (err: any) {
          vscode.window.showErrorMessage(`Falha ao sincronizar dependências: ${err.message}`);
        }
      }
    );
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
      }
    );
  }
}
