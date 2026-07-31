import type { Data7Configuration } from "@data7/core";

/**
 * Options the VS Code client sends in `InitializeParams.initializationOptions`.
 * Settings must arrive before any indexation so the core does not fall back to
 * defaults (same contract as MCP/CLI — LSP-001).
 */
export interface Data7LspInitializeOptions {
  readonly settings?: Data7Configuration;
}
