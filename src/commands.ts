import * as vscode from "vscode";

import { COMMAND_IDS } from "./infra/constants";
import { logger } from "./infra/logger";

import { ActivationService } from "./services/activation-service";
import { BuildService } from "./services/build-service";
import { DependencyService } from "./services/dependency-service";
import { DocsService } from "./services/docs-service";
import { MCPService } from "./services/mcp-service";
import { ProjectService } from "./services/project-service";
import { RepositoryService } from "./services/repository-service";
import { PreviewService } from "./services/preview-service";

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
    [COMMAND_IDS.openProject, (uri: vscode.Uri) => ProjectService.openProject(uri)],
    [COMMAND_IDS.decompose, (uri: vscode.Uri) => ProjectService.decomposeActiveProject(uri)],
    [COMMAND_IDS.newProject, () => ProjectService.createNewProject()],
    [COMMAND_IDS.openDevStudio, () => BuildService.openInDevStudio()],
    [COMMAND_IDS.build, () => BuildService.build()],
    [COMMAND_IDS.runProject, () => BuildService.run()],
    [COMMAND_IDS.installModule, () => DependencyService.installModule()],
    [COMMAND_IDS.updateDependencies, () => DependencyService.updateDependencies()],
    [
      COMMAND_IDS.importModuleToRepository,
      async () => {
        await RepositoryService.importModuleToRepository();
        await DependencyService.refreshActiveProject();
      },
    ],
    [
      COMMAND_IDS.bulkImportToRepository,
      async () => {
        await RepositoryService.bulkImportToRepository();
        await DependencyService.refreshActiveProject();
      },
    ],
    [COMMAND_IDS.exploreRepository, () => RepositoryService.exploreRepository()],
    [COMMAND_IDS.openParentFolder, () => ActivationService.openParentFolder()],
    [COMMAND_IDS.generateSystemLibraryDocs, () => DocsService.generateDocs()],
    [COMMAND_IDS.injectSystemLibraryDocs, () => DocsService.injectIntoAgentsMd()],
    [COMMAND_IDS.installMcpServer, () => MCPService.installMcpServer(context)],
    [COMMAND_IDS.previewMcpClientConfig, () => MCPService.previewClientConfig(context)],
    [
      COMMAND_IDS.showOutput,
      () => {
        logger.show();
      },
    ],
    [COMMAND_IDS.previewTranspiledCode, () => PreviewService.showPreview(true)],
    [COMMAND_IDS.previewTranspiledCodeActive, () => PreviewService.showPreview(false)],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler as (...args: unknown[]) => unknown),
    );
  }
}
