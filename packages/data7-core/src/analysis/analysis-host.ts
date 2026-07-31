/**
 * Host boundary for the analysis engine (REFACTOR-ANALYSIS-ENGINE.md § Fase 2).
 *
 * The core must not reach into the VS Code extension host, MCP stdio process, or
 * CLI through ad-hoc globals. Everything that touches open documents, workspace
 * folders, the filesystem, or log sinks goes through {@link AnalysisHost}.
 *
 * Two production implementations ship with the core:
 * - {@link createNodeAnalysisHost} — headless (CLI, MCP, tests, future LSP)
 * - {@link createVscodeAnalysisHost} — wraps `platform/vscode-api` proxies
 *
 * Call {@link installAnalysisHost} once at process bootstrap. Analysis modules
 * then read the active host via {@link getAnalysisHost}.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "../platform/vscode-api";

export type AnalysisLogLevel = "info" | "warn" | "error";

export interface AnalysisHostDocument {
  readonly uri: string;
  readonly version: number;
  getText(): string;
}

export interface AnalysisWorkspaceFolder {
  readonly uri: string;
  readonly name: string;
  readonly index: number;
}

export interface AnalysisDirent {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

/**
 * Filesystem surface used by indexing, analysis-cache and dependency scanning.
 * Sync methods cover today's call sites; async mirrors are what the LSP host
 * will prefer once indexing becomes fully non-blocking.
 */
export interface AnalysisHostFs {
  existsSync(fsPath: string): boolean;
  readFileSync(fsPath: string): string;
  readdirSync(fsPath: string): string[];
  statSync(fsPath: string): { isDirectory(): boolean; isFile(): boolean };
  mkdirSync(fsPath: string, options?: { recursive?: boolean }): void;
  writeFileSync(fsPath: string, data: string): void;
  readdirWithFileTypes(fsPath: string): Promise<readonly AnalysisDirent[]>;
  exists(fsPath: string): Promise<boolean>;
  readFile(fsPath: string): Promise<string>;
}

export interface AnalysisHost {
  getOpenDocument(uri: string): AnalysisHostDocument | undefined;
  getWorkspaceFolders(): readonly AnalysisWorkspaceFolder[] | undefined;
  readonly fs: AnalysisHostFs;
  log(level: AnalysisLogLevel, message: string, err?: unknown): void;
  onDidChangeConfiguration(listener: (section: string) => void): { dispose(): void };
  /**
   * Replaces the set of documents treated as open. Headless hosts (MCP/CLI)
   * use this instead of mutating `vscode.workspace.textDocuments`.
   * No-op on hosts that read documents from a live IDE API.
   */
  setOpenDocuments?(documents: Iterable<AnalysisHostDocument>): void;
}

export interface NodeAnalysisHostOptions {
  /** Documents considered open (MCP/CLI inject ephemeral buffers here). */
  readonly openDocuments?: Iterable<AnalysisHostDocument>;
  readonly workspaceFolders?: readonly AnalysisWorkspaceFolder[];
  /** Override the default no-op logger (e.g. write to stderr in CLI). */
  readonly log?: AnalysisHost["log"];
  readonly fs?: AnalysisHostFs;
}

export interface VscodeAnalysisHostOptions {
  /**
   * Log sink. Defaults to writing through `platform/vscode-api`'s
   * `createOutputChannel("Data7")` once and reusing the channel.
   */
  readonly log?: AnalysisHost["log"];
}

function normalizeUriKey(uri: string): string {
  return uri.toLowerCase();
}

export function createNodeFs(): AnalysisHostFs {
  return {
    existsSync: (fsPath) => fs.existsSync(fsPath),
    readFileSync: (fsPath) => fs.readFileSync(fsPath, "utf-8"),
    readdirSync: (fsPath) => fs.readdirSync(fsPath),
    statSync: (fsPath) => {
      const stat = fs.statSync(fsPath);
      return {
        isDirectory: () => stat.isDirectory(),
        isFile: () => stat.isFile(),
      };
    },
    mkdirSync: (fsPath, options) => {
      fs.mkdirSync(fsPath, options);
    },
    writeFileSync: (fsPath, data) => {
      fs.writeFileSync(fsPath, data, "utf-8");
    },
    readdirWithFileTypes: async (fsPath) => {
      const entries = await fs.promises.readdir(fsPath, { withFileTypes: true });
      return entries.map((entry) => ({
        name: entry.name,
        isDirectory: () => entry.isDirectory(),
        isFile: () => entry.isFile(),
      }));
    },
    exists: async (fsPath) => fs.existsSync(fsPath),
    readFile: async (fsPath) => fs.promises.readFile(fsPath, "utf-8"),
  };
}

/**
 * Headless host: Node filesystem, mutable open-document map, no OutputChannel.
 */
export function createNodeAnalysisHost(options: NodeAnalysisHostOptions = {}): AnalysisHost {
  const openByUri = new Map<string, AnalysisHostDocument>();
  if (options.openDocuments) {
    for (const doc of options.openDocuments) {
      openByUri.set(normalizeUriKey(doc.uri), doc);
    }
  }

  const hostFs = options.fs ?? createNodeFs();
  const log =
    options.log ??
    ((_level: AnalysisLogLevel, _message: string, _err?: unknown): void => undefined);
  const configListeners = new Set<(section: string) => void>();

  const host: AnalysisHost & {
    notifyConfigurationChanged(section: string): void;
  } = {
    getOpenDocument(uri: string): AnalysisHostDocument | undefined {
      return openByUri.get(normalizeUriKey(uri));
    },
    getWorkspaceFolders(): readonly AnalysisWorkspaceFolder[] | undefined {
      return options.workspaceFolders;
    },
    fs: hostFs,
    log,
    onDidChangeConfiguration(listener) {
      configListeners.add(listener);
      return {
        dispose: () => {
          configListeners.delete(listener);
        },
      };
    },
    setOpenDocuments(documents: Iterable<AnalysisHostDocument>): void {
      openByUri.clear();
      for (const doc of documents) {
        openByUri.set(normalizeUriKey(doc.uri), doc);
      }
    },
    notifyConfigurationChanged(section: string): void {
      for (const listener of configListeners) {
        listener(section);
      }
    },
  };

  return host;
}

/**
 * Host backed by the installed `platform/vscode-api` proxies. Call after
 * {@link installVscodeApi} so open documents and folders reflect the real IDE.
 */
export function createVscodeAnalysisHost(options: VscodeAnalysisHostOptions = {}): AnalysisHost {
  const hostFs = createNodeFs();
  let channel: vscode.OutputChannel | undefined;

  const defaultLog: AnalysisHost["log"] = (level, message, err) => {
    channel ??= vscode.window.createOutputChannel("Data7");
    const prefix = level.toUpperCase();
    channel.appendLine(`[${prefix}] ${message}`);
    if (err !== undefined) {
      const detail =
        err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
      channel.appendLine(detail);
    }
    if (level === "error") {
      channel.show(true);
    }
  };

  return {
    getOpenDocument(uri: string): AnalysisHostDocument | undefined {
      const key = normalizeUriKey(uri);
      const doc = vscode.workspace.textDocuments.find(
        (candidate) => normalizeUriKey(candidate.uri.toString()) === key,
      );
      if (!doc) return undefined;
      return {
        uri: doc.uri.toString(),
        version: doc.version,
        getText: () => doc.getText(),
      };
    },
    getWorkspaceFolders(): readonly AnalysisWorkspaceFolder[] | undefined {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders) return undefined;
      return folders.map((folder, index) => ({
        uri: folder.uri.toString(),
        name: folder.name,
        index: folder.index ?? index,
      }));
    },
    fs: hostFs,
    log: options.log ?? defaultLog,
    onDidChangeConfiguration(listener) {
      return vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("data7")) {
          listener("data7");
        }
      });
    },
  };
}

/**
 * Convenience: build a workspace-folder descriptor from an absolute path.
 */
export function workspaceFolderFromPath(folderPath: string, index = 0): AnalysisWorkspaceFolder {
  const uri = vscode.Uri.file(folderPath).toString();
  return {
    uri,
    name: path.basename(folderPath),
    index,
  };
}

let activeHost: AnalysisHost = createNodeAnalysisHost();

export function installAnalysisHost(host: AnalysisHost): void {
  activeHost = host;
}

export function getAnalysisHost(): AnalysisHost {
  return activeHost;
}

/** Restores the default headless host. Used by tests between cases. */
export function resetAnalysisHostForTests(): void {
  activeHost = createNodeAnalysisHost();
}
