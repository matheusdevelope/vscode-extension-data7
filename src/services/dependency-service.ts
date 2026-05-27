import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import type { SharedModuleInfo } from "../analysis/dependency-scanner";
import { DependencyScanner, IMPORTS_REGEX } from "../analysis/dependency-scanner";
import { Builder } from "../project/builder";
import { ProjectService } from "./project-service";
import { RepositoryService } from "./repository-service";
import { DiagnosticService } from "./diagnostic-service";
import { logger } from "../infra/logger";
import { PROJECT_CONFIG_FILENAME } from "../infra/constants";

interface ProjectMetadataJson {
  dependencies?: Record<string, string>;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProjectMeta(configJsonPath: string): ProjectMetadataJson | undefined {
  if (!fs.existsSync(configJsonPath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch (err) {
    logger.error(`Erro ao ler ${configJsonPath}.`, err);
    return undefined;
  }
}

export class DependencyService {
  /**
   * Detects modules referenced by the project and syncs the corresponding
   * `.bas` files into `data7_modules/`. Updates `data7.json#dependencies` when
   * new modules are discovered or stale ones removed.
   */
  public static detectAndSyncProjectDependencies(workspaceDir: string): Promise<string[]> {
    return Promise.resolve(this.detectAndSyncProjectDependenciesSync(workspaceDir));
  }

  private static detectAndSyncProjectDependenciesSync(workspaceDir: string): string[] {
    const configJsonPath = path.join(workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath);
    if (!projectMeta) return [];
    projectMeta.dependencies ??= {};

    const srcDir = path.join(workspaceDir, "src");
    if (!fs.existsSync(srcDir)) return [];

    const repoBasPath = RepositoryService.getRepoBasPath();
    if (!repoBasPath || !fs.existsSync(repoBasPath)) return [];

    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);

    const localModules = new Set<string>();
    const basFiles = DependencyScanner.getFilesRecursive(srcDir, [".bas"]);
    for (const file of basFiles) {
      const filename = path.basename(file, ".bas");
      localModules.add(filename.toLowerCase());
      try {
        const content = fs.readFileSync(file, "utf-8");
        const nsMatch = /\bNamespace\s+([a-zA-Z0-9_]+)/i.exec(content);
        if (nsMatch) {
          localModules.add(nsMatch[1].toLowerCase());
        }
      } catch (err) {
        logger.warn(`Falha ao ler ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const filesToScan: string[] = [...basFiles];
    const scannedFiles = new Set<string>();
    const resolvedDependencies = new Map<string, SharedModuleInfo>();
    const missingModules = new Set<string>();

    const importsRegex = IMPORTS_REGEX;
    const directCallRegex = /\b(mod_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+)(?=\.)/i;

    const processReferencedModuleName = (rawModName: string, isExplicit: boolean): void => {
      if (DependencyScanner.isIgnoredNamespace(rawModName)) return;
      const lowerModName = rawModName.toLowerCase();
      if (localModules.has(lowerModName)) return;

      let resolvedKey = lowerModName;
      let found = sharedModules.has(resolvedKey);
      if (!found) {
        if (sharedModules.has("mod_" + resolvedKey)) {
          resolvedKey = "mod_" + resolvedKey;
          found = true;
        } else if (resolvedKey.startsWith("mod_") && sharedModules.has(resolvedKey.substring(4))) {
          resolvedKey = resolvedKey.substring(4);
          found = true;
        }
      }

      if (found) {
        const resolvedInfo = sharedModules.get(resolvedKey);
        if (resolvedInfo && !resolvedDependencies.has(resolvedKey)) {
          resolvedDependencies.set(resolvedKey, resolvedInfo);
          filesToScan.push(resolvedInfo.sourceFilePath);
        }
      } else if (isExplicit || lowerModName.startsWith("mod_")) {
        missingModules.add(rawModName);
      }
    };

    while (filesToScan.length > 0) {
      const currentFilePath = filesToScan.shift();
      if (!currentFilePath) break;
      const lowerPath = currentFilePath.toLowerCase();
      if (scannedFiles.has(lowerPath)) continue;
      scannedFiles.add(lowerPath);

      try {
        const fileContent = fs.readFileSync(currentFilePath, "utf-8");
        const lines = fileContent.split(/\r?\n/);
        for (const lineText of lines) {
          const cleanLine = DependencyScanner.stripComments(lineText);
          if (!cleanLine.trim()) continue;
          const match = cleanLine.match(importsRegex);
          if (match) processReferencedModuleName(match[1], true);
          const dMatch = directCallRegex.exec(cleanLine);
          if (dMatch) processReferencedModuleName(dMatch[1], false);
        }
      } catch (err) {
        logger.error(`Erro ao escanear ${currentFilePath} para dependências.`, err);
      }
    }

    const existingDeps = projectMeta.dependencies ?? {};
    let dependenciesUpdated = false;
    const newDeps: Record<string, string> = {};

    for (const [, info] of resolvedDependencies.entries()) {
      const actualName = info.moduleName;
      const version = info.version ?? "1.0.0.0";
      newDeps[actualName.toLowerCase()] = version;
      if (!existingDeps[actualName.toLowerCase()]) {
        dependenciesUpdated = true;
        logger.info(`Auto-detectada dependência: ${actualName} (adicionada ao data7.json)`);
      }
    }

    for (const existingKey of Object.keys(existingDeps)) {
      if (!newDeps[existingKey.toLowerCase()]) {
        dependenciesUpdated = true;
        logger.info(`Removendo dependência não referenciada: ${existingKey}`);
      }
    }

    projectMeta.dependencies = newDeps;
    if (dependenciesUpdated) {
      try {
        fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");
      } catch (err) {
        logger.error("Erro ao escrever data7.json atualizado.", err);
      }
    }

    const data7ModulesDir = path.join(workspaceDir, "data7_modules");
    const synced = DependencyScanner.syncDependencies(
      srcDir,
      data7ModulesDir,
      repoBasPath,
      projectMeta.dependencies,
    );

    if (missingModules.size > 0) {
      vscode.window.showWarningMessage(
        `Os seguintes módulos referenciados não foram encontrados no repositório nem no projeto local: ${Array.from(missingModules).join(", ")}`,
      );
    }

    return synced;
  }

  /** Manual install of a shared module from the repository into the active project. */
  public static async installModule(): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado para instalar dependências.",
      );
      return;
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
    if (sharedModules.size === 0) {
      vscode.window.showErrorMessage(
        "Nenhum módulo compartilhado foi encontrado no repositório configurado.",
      );
      return;
    }

    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    projectMeta.dependencies ??= {};
    const projectDeps = projectMeta.dependencies;

    const quickPickItems = Array.from(sharedModules.values()).map((info) => {
      const isAlreadyInstalled = !!projectDeps[info.moduleName.toLowerCase()];
      return {
        label: info.moduleName,
        description:
          `v${info.version ?? "1.0.0.0"}` + (isAlreadyInstalled ? " (já instalado)" : ""),
        detail: `Origem: ${path.basename(info.sourceFilePath)}`,
      };
    });

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      placeHolder: "Selecione o módulo compartilhado para instalar no projeto",
      ignoreFocusOut: true,
    });
    if (!selected) return;

    const versionString = selected.description.split(" ")[0].replace(/^v/, "");
    projectDeps[selected.label.toLowerCase()] = versionString;
    fs.writeFileSync(configJsonPath, JSON.stringify(projectMeta, null, 2), "utf-8");

    try {
      const srcDir = path.join(project.workspaceDir, "src");
      const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
      DependencyScanner.syncDependencies(srcDir, data7ModulesDir, repoBasPath, projectDeps);
      Builder.buildProject(project.workspaceDir, project.projectFilePath);

      vscode.window.showInformationMessage(
        `Módulo "${selected.label}" v${versionString} instalado e compilado com sucesso!`,
      );
      DiagnosticService.refreshAllActive();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Falha na instalação/build do módulo.", err);
      vscode.window.showErrorMessage(`Falha na instalação/build do módulo: ${message}`);
    }
  }

  /** Pulls fresh copies of declared dependencies from the repository. */
  public static async updateDependencies(): Promise<void> {
    const project = ProjectService.getActiveProject();
    if (!project) {
      vscode.window.showErrorMessage(
        "Nenhum projeto Data7 ativo detectado para atualizar dependências.",
      );
      return;
    }

    const repoBasPath = RepositoryService.getRepoBasPath();
    const configJsonPath = path.join(project.workspaceDir, PROJECT_CONFIG_FILENAME);
    if (!fs.existsSync(configJsonPath)) {
      vscode.window.showErrorMessage("Projeto data7.json não encontrado.");
      return;
    }

    const projectMeta = readProjectMeta(configJsonPath) ?? { dependencies: {} };
    const deps = projectMeta.dependencies ?? {};
    if (Object.keys(deps).length === 0) {
      vscode.window.showWarningMessage("Nenhuma dependência declarada em data7.json.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Atualizando dependências do projeto...",
        cancellable: true,
      },
      (_progress, token) =>
        Promise.resolve().then(() => {
          try {
            if (token.isCancellationRequested) return;
            const srcDir = path.join(project.workspaceDir, "src");
            const data7ModulesDir = path.join(project.workspaceDir, "data7_modules");
            const synced = DependencyScanner.syncDependencies(
              srcDir,
              data7ModulesDir,
              repoBasPath,
              deps,
            );

            const sharedModules = DependencyScanner.scanSharedModules(repoBasPath);
            const updatedList = synced.map((name) => {
              const info = sharedModules.get(name.toLowerCase());
              return `${info?.moduleName ?? name} (v${info?.version ?? "1.0.0.0"})`;
            });

            Builder.buildProject(project.workspaceDir, project.projectFilePath);

            if (updatedList.length > 0) {
              vscode.window.showInformationMessage(
                `Dependências atualizadas com sucesso: ${updatedList.join(", ")}`,
              );
            } else {
              vscode.window.showInformationMessage("Todas as dependências já estão atualizadas.");
            }
            DiagnosticService.refreshAllActive();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error("Falha ao atualizar dependências.", err);
            vscode.window.showErrorMessage(`Falha ao atualizar dependências: ${message}`);
          }
        }),
    );
  }
}
