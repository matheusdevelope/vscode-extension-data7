/**
 * Runtime stand-in for the `vscode` namespace, installed by the MCP
 * server before any module that does `import "vscode"` is loaded.
 *
 * Why this file exists
 * --------------------
 * The MCP server runs OUTSIDE the extension host (as a stdio child
 * process spawned by external MCP clients). Several modules we want to
 * reuse — most notably `DiagnosticsLinter` and `WorkspaceSymbolIndexer`
 * — still `import * as vscode from "vscode"` for their type / value
 * needs (`Range`, `Diagnostic`, `Uri`, `DiagnosticSeverity`, …). Inside
 * the host that import is satisfied by the embedded `vscode` module;
 * outside it would throw `Cannot find module 'vscode'`.
 *
 * This shim installs a `Module.prototype.require` override that returns
 * a minimal value-mock of `vscode` whenever something asks for it. The
 * surface is intentionally narrow — we add a class/field only when a
 * reused module hits it. (This is the same approach
 * `src/test/_setup/vscode-mock.ts` uses; we keep a separate copy to
 * preserve `governance.mdc`'s rule that production sources do not
 * depend on the test tree.)
 *
 * Calling `installVscodeShim()` is idempotent and must happen before
 * any `require("./out/diagnostics/...")` or `require("./out/analysis/...")`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import Module = require("module");

class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

class Range {
  start: { line: number; character: number };
  end: { line: number; character: number };
  constructor(
    startLineOrStart: number | Position,
    startCharOrEnd: number | Position,
    endLine?: number,
    endChar?: number,
  ) {
    if (typeof startLineOrStart === "number") {
      this.start = { line: startLineOrStart, character: startCharOrEnd as number };
      this.end = {
        line: endLine ?? startLineOrStart,
        character: endChar ?? (startCharOrEnd as number),
      };
    } else {
      this.start = { line: startLineOrStart.line, character: startLineOrStart.character };
      const e = startCharOrEnd as Position;
      this.end = { line: e.line, character: e.character };
    }
  }
}

class Location {
  constructor(
    public uri: unknown,
    public range: unknown,
  ) {}
}

class Diagnostic {
  code?: string | number;
  data?: unknown;
  constructor(
    public range: unknown,
    public message: string,
    public severity: number,
  ) {}
}

class MarkdownString {
  value = "";
  isTrusted = false;
  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }
  appendCodeblock(value: string): this {
    this.value += "```\n" + value + "\n```";
    return this;
  }
  appendText(value: string): this {
    this.value += value;
    return this;
  }
}

class Hover {
  constructor(
    public contents: unknown,
    public range?: unknown,
  ) {}
}

class TextEdit {
  static replace(range: unknown, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
  static insert(position: unknown, newText: string): TextEdit {
    return new TextEdit(position, newText);
  }
  constructor(
    public range: unknown,
    public newText: string,
  ) {}
}

const noopCancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: (): { dispose(): void } => ({ dispose: () => undefined }),
};

const vscodeShim = {
  Range,
  Position,
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Uri: {
    file: (p: string) => ({
      toString: () => "file:///" + p.replace(/\\/g, "/"),
      fsPath: p,
    }),
    parse: (s: string) => {
      const decoded = decodeURIComponent(s);
      const stripped = decoded.replace(/^file:\/+/, "");
      const fsPath =
        process.platform === "win32"
          ? stripped.replace(/\//g, "\\")
          : "/" + stripped.replace(/\\/g, "/");
      return { toString: () => s, fsPath };
    },
  },
  Location,
  MarkdownString,
  Hover,
  TextEdit,
  SymbolKind: {
    File: 0,
    Module: 1,
    Namespace: 2,
    Package: 3,
    Class: 4,
    Method: 5,
    Property: 6,
    Field: 7,
    Constructor: 8,
    Enum: 9,
    Interface: 10,
    Function: 11,
    Variable: 12,
    Constant: 13,
    String: 14,
    Number: 15,
    Boolean: 16,
    Array: 17,
    Object: 18,
    Key: 19,
    Null: 20,
    EnumMember: 21,
    Struct: 22,
    Event: 23,
    Operator: 24,
    TypeParameter: 25,
  },
  workspace: {
    isTrusted: true,
    textDocuments: [] as unknown[],
    workspaceFolders: undefined as unknown,
    getConfiguration: () => ({
      get: (key: string): unknown => {
        if (key === "sharedModulesPath") return "";
        if (key === "enableAutoSync") return false;
        if (key === "autoFormatOnSave") return false;
        if (key === "exclude") return ["**/node_modules/**", "**/out/**"];
        if (key === "diagnosticSeverity") return {};
        return undefined;
      },
      update: (): Promise<void> => Promise.resolve(),
    }),
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose: () => undefined }),
      onDidCreate: () => ({ dispose: () => undefined }),
      onDidDelete: () => ({ dispose: () => undefined }),
      dispose: () => undefined,
    }),
    onDidChangeConfiguration: () => ({ dispose: () => undefined }),
    onWillSaveTextDocument: () => ({ dispose: () => undefined }),
    openTextDocument: (): Promise<unknown> => Promise.resolve({}),
    asRelativePath: (p: string): string => p,
    getWorkspaceFolder: (): unknown => undefined,
  },
  window: {
    createOutputChannel: () => ({
      appendLine: (): void => undefined,
      append: (): void => undefined,
      show: (): void => undefined,
      dispose: (): void => undefined,
    }),
    createStatusBarItem: () => ({
      text: "",
      tooltip: "",
      command: "",
      show: (): void => undefined,
      hide: (): void => undefined,
      dispose: (): void => undefined,
    }),
    showInformationMessage: (): Promise<string | undefined> => Promise.resolve(undefined),
    showWarningMessage: (): Promise<string | undefined> => Promise.resolve(undefined),
    showErrorMessage: (): Promise<string | undefined> => Promise.resolve(undefined),
    showQuickPick: (): Promise<unknown> => Promise.resolve(undefined),
    showOpenDialog: (): Promise<unknown> => Promise.resolve(undefined),
    showTextDocument: (): Promise<unknown> => Promise.resolve(undefined),
    withProgress: <T>(
      _opts: unknown,
      task: (progress: { report: (v: unknown) => void }) => Promise<T>,
    ): Promise<T> => task({ report: () => undefined }),
    activeTextEditor: undefined as unknown,
  },
  languages: {
    getDiagnostics: (): [unknown, unknown[]][] => [],
    onDidChangeDiagnostics: () => ({ dispose: () => undefined }),
    createDiagnosticCollection: () => ({
      set: (): void => undefined,
      delete: (): void => undefined,
      clear: (): void => undefined,
      dispose: (): void => undefined,
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => undefined }),
    executeCommand: (): Promise<unknown> => Promise.resolve(undefined),
  },
  env: {
    clipboard: {
      writeText: (): Promise<void> => Promise.resolve(),
      readText: (): Promise<string> => Promise.resolve(""),
    },
  },
  CancellationTokenSource: class {
    token = noopCancellationToken;
    cancel(): void {
      this.token = { ...noopCancellationToken, isCancellationRequested: true };
    }
    dispose(): void {
      /* no-op */
    }
  },
};

let installed = false;
// eslint-disable-next-line @typescript-eslint/unbound-method
const originalRequire = Module.prototype.require;

export function installVscodeShim(): void {
  if (installed) return;
  installed = true;
  type RequireFn = (this: NodeJS.Module, id: string) => unknown;
  const interceptor: RequireFn = function (this: NodeJS.Module, id: string): unknown {
    if (id === "vscode") {
      return vscodeShim;
    }
    return (originalRequire as unknown as RequireFn).call(this, id);
  };
  (Module.prototype as unknown as { require: RequireFn }).require = interceptor;
}

/**
 * Exposes the shim object directly so tools inside `src/mcp/` can mutate
 * `workspace.textDocuments` without violating the `vscode` import fence.
 */
export const vscode = vscodeShim;

/** Test helper: lets unit tests reset `workspace.textDocuments` between runs. */
export function resetVscodeShim(): void {
  vscodeShim.workspace.textDocuments.length = 0;
}
