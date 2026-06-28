import * as path from "node:path";
import * as vscode from "vscode";
import { Builder, DiagnosticsLinter, isExcluded, logger, readConfiguration } from "@data7/core";
import type { BuildProjectOptions, TranspiledBuildSource, WorkspaceSymbolIndexer } from "@data7/core";

/**
 * VS Code-facing build orchestration. The project kernel receives all runtime
 * policies through `BuildProjectOptions` and stays independent of the host.
 */
export class ProjectBuildService {
  public static buildProject(
    workspaceDir: string,
    outputFilePath: string,
    sharedModulesDir?: string,
    options: BuildProjectOptions = {},
  ): string {
    const configuration = readConfiguration();
    const sugars = configuration.sugars;
    return Builder.buildProject(workspaceDir, outputFilePath, sharedModulesDir, {
      ...options,
      sugarOptions: {
        enabled: configuration.features.language.sugars && sugars.enabled,
        enabledSugarIds: sugars.enabledIds,
        disabledSugarIds: sugars.disabledIds,
      },
      genericsEnabled: configuration.features.language.generics,
      isExcluded,
      onWarning: (message) => {
        logger.warn(message);
      },
      validateTranspiled: (sources, indexer) => {
        this.validateTranspiled(sources, indexer);
      },
    });
  }

  private static validateTranspiled(
    sources: readonly TranspiledBuildSource[],
    indexer: WorkspaceSymbolIndexer,
  ): void {
    const linter = new DiagnosticsLinter({ strict: true });
    for (const source of sources) {
      const document = {
        uri: vscode.Uri.parse(source.fileUri),
        languageId: "d7basic",
        version: 1,
        getText: () => source.code,
      } as unknown as vscode.TextDocument;
      const errors = linter
        .runDiagnostics(document, indexer)
        .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error);
      if (errors.length === 0) continue;

      const filename = path.basename(document.uri.fsPath);
      const details = errors
        .map(
          (diagnostic) =>
            `[${(diagnostic.range.start.line + 1).toString()}:${diagnostic.range.start.character.toString()}] ${diagnostic.message}`,
        )
        .join("\n");
      logger.error(`[Build] Erro de Linter/Sintaxe Nativa em ${filename}:\n${details}`);
      throw new Error(
        `O build foi abortado devido a erros de validação strict native em ${filename}:\n${details}`,
      );
    }
  }
}
