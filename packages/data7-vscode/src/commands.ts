import * as vscode from "vscode";
import * as path from "path";

import { COMMAND_IDS, logger } from "@data7/core";

import { ActivationService } from "./services/activation-service";
import { BuildService } from "./services/build-service";
import { DependencyService } from "./services/dependency-service";
import { DocsService } from "./services/docs-service";
import { MCPService } from "./services/mcp-service";
import { ProjectService } from "./services/project-service";
import { RepositoryService } from "./services/repository-service";
import { PreviewService } from "./services/preview-service";
import { WorkspaceFixService } from "./services/workspace-fix-service";
import { DiagnosticService } from "./services/diagnostic-service";

/**
 * Registers every `data7.*` command contributed by the extension. Each entry
 * here must have a matching `contributes.commands` entry in `package.json`
 * (kept in lockstep through the {@link COMMAND_IDS} table in
 * `infra/constants.ts`).
 *
 * Lives outside `extension.ts` so the activation entry point stays focused on
 * orchestration only.
 */
export function registerCommands(context: vscode.ExtensionContext): void {
  const commands: [string, (...args: never[]) => unknown][] = [
    // Project commands
    [COMMAND_IDS.newProject, () => ProjectService.createNewProject()],
    [COMMAND_IDS.openProject, (uri: vscode.Uri) => ProjectService.openProject(uri)],
    [COMMAND_IDS.openDevStudio, () => BuildService.openInDevStudio()],
    [COMMAND_IDS.build, () => BuildService.build()],
    [COMMAND_IDS.runProject, () => BuildService.run()],
    [COMMAND_IDS.decompose, (uri: vscode.Uri) => ProjectService.decomposeActiveProject(uri)],

    // Module commands
    [
      COMMAND_IDS.installModule,
      async (moduleName?: string) => {
        await DependencyService.installModule(moduleName);
        await vscode.commands.executeCommand("data7.modules.refreshView");
      },
    ],
    [
      COMMAND_IDS.installModulesBulk,
      async (moduleNames: string[]) => {
        await DependencyService.installModules(moduleNames);
        await vscode.commands.executeCommand("data7.modules.refreshView");
      },
    ],
    [
      COMMAND_IDS.updateDependencies,
      async () => {
        await DependencyService.updateDependencies();
        await vscode.commands.executeCommand("data7.modules.refreshView");
      },
    ],
    [
      COMMAND_IDS.importModuleToRepository,
      async () => {
        await RepositoryService.importModuleToRepository();
        await DependencyService.refreshActiveProject();
        await vscode.commands.executeCommand("data7.modules.refreshView");
      },
    ],
    [
      COMMAND_IDS.bulkImportToRepository,
      async () => {
        await RepositoryService.bulkImportToRepository();
        await DependencyService.refreshActiveProject();
        await vscode.commands.executeCommand("data7.modules.refreshView");
      },
    ],
    [COMMAND_IDS.exploreRepository, () => RepositoryService.exploreRepository()],
    [
      COMMAND_IDS.publishLocal,
      async () => {
        const activeProject = ProjectService.getActiveProject();
        if (!activeProject) {
          vscode.window.showWarningMessage("Nenhum projeto ativo encontrado no workspace para publicação.");
          return;
        }
        const projectName = path.basename(activeProject.workspaceDir);
        try {
          const { ModuleOrchestrator } = await import("@data7/core");
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Publicando módulo '${projectName}' localmente...`,
              cancellable: false
            },
            async () => {
              await ModuleOrchestrator.publishModuleLocally(activeProject.workspaceDir);
            }
          );
          vscode.window.showInformationMessage(`Módulo '${projectName}' publicado localmente com sucesso!`);
          await vscode.commands.executeCommand("data7.modules.refreshView");
        } catch (err: any) {
          vscode.window.showErrorMessage(`Falha ao publicar módulo localmente: ${err.message}`);
        }
      }
    ],
    [
      COMMAND_IDS.suggestDependencies,
      async () => {
        const activeProject = ProjectService.getActiveProject();
        if (!activeProject) {
          vscode.window.showWarningMessage("Nenhum projeto ativo encontrado no workspace para escanear dependências.");
          return;
        }
        await DependencyService.suggestAndInstallDetectedDependencies(activeProject.workspaceDir, { silent: false });
        await vscode.commands.executeCommand("data7.modules.refreshView");
      }
    ],

    // Linter/Fixer commands
    [COMMAND_IDS.runLinter, () => DiagnosticService.lintWorkspace(true)],
    [COMMAND_IDS.fixActiveFile, () => WorkspaceFixService.fixActiveEditor()],
    [COMMAND_IDS.fixAllWorkspace, () => WorkspaceFixService.fixAllWorkspace()],

    // Preview commands
    [COMMAND_IDS.previewTranspiledCode, () => PreviewService.showPreview(true)],
    [COMMAND_IDS.previewTranspiledCodeActive, () => PreviewService.showPreview(false)],

    // Documentation commands
    [COMMAND_IDS.generateSystemLibraryDocs, () => DocsService.generateDocs()],
    [COMMAND_IDS.injectSystemLibraryDocs, () => DocsService.injectIntoAgentsMd()],

    // MCP commands
    [COMMAND_IDS.installMcpServer, () => MCPService.installMcpServer(context)],
    [COMMAND_IDS.previewMcpClientConfig, () => MCPService.previewClientConfig(context)],

    // Utility commands
    [COMMAND_IDS.openParentFolder, () => ActivationService.openParentFolder()],
    [
      COMMAND_IDS.showOutput,
      () => {
        logger.show();
      },
    ],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown),
    );
  }
}
