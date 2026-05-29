/**
 * Canonical string constants shared across the extension.
 *
 * Centralising these literals here:
 *  - eliminates the risk of typos at call sites (a wrong key fails to compile
 *    instead of silently going dead),
 *  - gives every consumer a single import to update when a key is renamed,
 *  - documents the manifest contract (`package.json#contributes.*`) in one
 *    place so reviewers can confirm consistency without grepping.
 *
 * Every value declared here must match an entry in `package.json` (commands,
 * languages, configuration). Adding a new command or language id requires
 * updating both this file and the manifest.
 */

/** Settings namespace used with `vscode.workspace.getConfiguration(...)`. */
export const CONFIG_NAMESPACE = "data7" as const;

/** Source identifier attached to every `vscode.Diagnostic` emitted by the linter. */
export const DIAGNOSTIC_SOURCE = "data7" as const;

/** Filename of the per-project metadata read/written by the builder/decompiler. */
export const PROJECT_CONFIG_FILENAME = "data7.json" as const;

/** Language IDs contributed by `package.json#contributes.languages`. */
export const LANGUAGE_IDS = {
  /** Data7 Basic source files (`.bas`, `.d7b`). */
  d7basic: "d7basic",
  /** Data7 project XML files (`.7proj`, `.7Proj`). */
  data7project: "data7project",
} as const;

export type LanguageId = (typeof LANGUAGE_IDS)[keyof typeof LANGUAGE_IDS];

/**
 * Command IDs contributed by `package.json#contributes.commands`. Every entry
 * here must have a matching `contributes.commands[*].command` entry and every
 * `registerCommand(...)` call must pull its id from this object.
 */
export const COMMAND_IDS = {
  openProject: "data7.openProject",
  newProject: "data7.newProject",
  openDevStudio: "data7.openDevStudio",
  build: "data7.build",
  runProject: "data7.runProject",
  installModule: "data7.installModule",
  updateDependencies: "data7.updateDependencies",
  importModuleToRepository: "data7.importModuleToRepository",
  bulkImportToRepository: "data7.bulkImportToRepository",
  exploreRepository: "data7.exploreRepository",
  decompose: "data7.decompose",
  openParentFolder: "data7.openParentFolder",
  generateSystemLibraryDocs: "data7.generateSystemLibraryDocs",
  injectSystemLibraryDocs: "data7.injectSystemLibraryDocs",
  showOutput: "data7.showOutput",
  installMcpServer: "data7.installMcpServer",
  previewMcpClientConfig: "data7.previewMcpClientConfig",
  previewTranspiledCode: "data7.previewTranspiledCode",
  previewTranspiledCodeActive: "data7.previewTranspiledCodeActive",
} as const;

export type CommandId = (typeof COMMAND_IDS)[keyof typeof COMMAND_IDS];
