import * as vscode from "vscode";
import {
  Builder,
  assertTranspiledNativeSyntax,
  isExcluded,
  logger,
  readConfiguration,
} from "@data7/core";
import type { BuildProjectOptions } from "@data7/core";

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
    const openEditorPaths = this.collectOpenEditorPaths();
    return Builder.buildProject(workspaceDir, outputFilePath, sharedModulesDir, {
      ...options,
      openEditorPaths,
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
      validateTranspiled: (sources) => {
        try {
          assertTranspiledNativeSyntax(sources);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(`[Build] ${message}`);
          throw err;
        }
      },
    });
  }

  /**
   * Returns the set of normalized (lower-case) absolute file-system paths of
   * all files that have an open editor tab in any tab group.
   * Lower-casing makes the lookup case-insensitive, matching the builder's
   * own normalization on Windows where drive letters can differ in casing.
   */
  private static collectOpenEditorPaths(): ReadonlySet<string> {
    const paths = new Set<string>();
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input instanceof vscode.TabInputText) {
          paths.add(tab.input.uri.fsPath.toLowerCase());
        }
      }
    }
    return paths;
  }
}
