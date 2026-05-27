import Module = require("module");

/**
 * In-process mock of the `vscode` namespace.
 *
 * Surface is intentionally minimal (`testing.mdc`) and is extended only when a
 * test exercises a new VS Code API. Importing this file overrides Node's
 * `require('vscode')` resolution for the rest of the test process.
 */

// ===========================================================================
// Core position / range / location types
// ===========================================================================

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

class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
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

// ===========================================================================
// UI primitives consumed by providers / services
// ===========================================================================

class MarkdownString {
  value = "";
  isTrusted = false;
  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }
  appendCodeblock(value: string, _language?: string): this {
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

interface InsertEdit {
  type: "insert";
  uri: unknown;
  position: unknown;
  text: string;
}
interface ReplaceEdit {
  type: "replace";
  uri: unknown;
  range: unknown;
  text: string;
}
interface DeleteEdit {
  type: "delete";
  uri: unknown;
  range: unknown;
}
type EditEntry = InsertEdit | ReplaceEdit | DeleteEdit;

class WorkspaceEdit {
  edits: EditEntry[] = [];
  insert(uri: unknown, position: unknown, text: string): void {
    this.edits.push({ type: "insert", uri, position, text });
  }
  replace(uri: unknown, range: unknown, text: string): void {
    this.edits.push({ type: "replace", uri, range, text });
  }
  delete(uri: unknown, range: unknown): void {
    this.edits.push({ type: "delete", uri, range });
  }
}

class CompletionItem {
  detail?: string;
  insertText?: unknown;
  documentation?: unknown;
  additionalTextEdits?: unknown[];
  tags?: number[];
  constructor(
    public label: unknown,
    public kind?: number,
  ) {}
}

class SnippetString {
  constructor(public value: string) {}
}

class CodeAction {
  diagnostics?: unknown[];
  edit?: WorkspaceEdit;
  isPreferred?: boolean;
  command?: { title: string; command: string; arguments?: unknown[] };
  constructor(
    public title: string,
    public kind?: unknown,
  ) {}
}

class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(
    public name: string,
    public detail: string,
    public kind: number,
    public range: unknown,
    public selectionRange: unknown,
  ) {}
}

class SymbolInformation {
  constructor(
    public name: string,
    public kind: number,
    public containerName: string,
    public location: unknown,
  ) {}
}

class FoldingRange {
  constructor(
    public start: number,
    public end: number,
    public kind?: number,
  ) {}
}

class DocumentLink {
  tooltip?: string;
  constructor(
    public range: unknown,
    public target?: unknown,
  ) {}
}

class SemanticTokensLegend {
  constructor(
    public tokenTypes: readonly string[],
    public tokenModifiers: readonly string[] = [],
  ) {}
}

class SemanticTokensBuilder {
  private tokens: {
    line: number;
    char: number;
    length: number;
    type: number;
    modifiers: number;
  }[] = [];
  constructor(_legend?: SemanticTokensLegend) {}
  push(line: number, char: number, length: number, tokenType: number, tokenModifiers = 0): void {
    this.tokens.push({ line, char, length, type: tokenType, modifiers: tokenModifiers });
  }
  build(): { data: Uint32Array } {
    const data = new Uint32Array(this.tokens.length * 5);
    this.tokens.forEach((t, i) => {
      data[i * 5 + 0] = t.line;
      data[i * 5 + 1] = t.char;
      data[i * 5 + 2] = t.length;
      data[i * 5 + 3] = t.type;
      data[i * 5 + 4] = t.modifiers;
    });
    return { data };
  }
}

class ParameterInformation {
  constructor(
    public label: string | [number, number],
    public documentation?: unknown,
  ) {}
}

class SignatureInformation {
  parameters: ParameterInformation[] = [];
  documentation?: unknown;
  constructor(
    public label: string,
    documentation?: unknown,
  ) {
    this.documentation = documentation;
  }
}

class SignatureHelp {
  signatures: SignatureInformation[] = [];
  activeSignature = 0;
  activeParameter = 0;
}

// ===========================================================================
// Cancellation token
// ===========================================================================

const noopCancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: (): { dispose(): void } => ({ dispose: () => undefined }),
};

/** Re-exported as a convenience for tests; equivalent to `vscode.CancellationToken`. */
export const noopToken = noopCancellationToken;

// ===========================================================================
// Namespace mock
// ===========================================================================

const diagnosticListeners: ((e: unknown) => void)[] = [];

const mockVsCode = {
  Range,
  Position,
  Diagnostic,
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Uri: {
    file: (p: string) => ({
      toString: () => "file:///" + p.replace(/\\/g, "/"),
      fsPath: p,
    }),
    /**
     * Cross-platform mock of `vscode.Uri.parse(...).fsPath`:
     *   - Windows: returns a backslash-separated path (e.g. `D:\foo\bar.bas`).
     *   - POSIX:   returns a slash-separated path (e.g. `/home/x/bar.bas`).
     * The previous implementation hardcoded `/` -> `\` substitution and broke
     * every test on Linux CI runners.
     */
    parse: (s: string) => {
      const decoded = decodeURIComponent(s);
      const stripped = decoded.replace(/^file:\/+/, "");
      const fsPath =
        process.platform === "win32"
          ? stripped.replace(/\//g, "\\")
          : "/" + stripped.replace(/\\/g, "/");
      return {
        toString: () => s,
        fsPath,
      };
    },
  },
  Location,
  MarkdownString,
  Hover,
  TextEdit,
  WorkspaceEdit,
  CompletionItem,
  CompletionItemKind: {
    Module: 0,
    Class: 1,
    Struct: 2,
    Interface: 3,
    Method: 4,
    Function: 5,
    Property: 6,
    Variable: 7,
    Field: 8,
    Keyword: 9,
    Snippet: 10,
  },
  CompletionItemTag: { Deprecated: 1 },
  SnippetString,
  CodeAction,
  CodeActionKind: {
    QuickFix: { value: "quickfix", append: (suffix: string) => ({ value: "quickfix." + suffix }) },
    SourceOrganizeImports: {
      value: "source.organizeImports",
      append: (suffix: string) => ({ value: "source.organizeImports." + suffix }),
    },
    SourceFixAll: {
      value: "source.fixAll",
      append: (suffix: string) => ({ value: "source.fixAll." + suffix }),
    },
    Source: { value: "source", append: (suffix: string) => ({ value: "source." + suffix }) },
  },
  DocumentSymbol,
  SymbolInformation,
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
  FoldingRange,
  FoldingRangeKind: { Comment: 1, Imports: 2, Region: 3 },
  DocumentLink,
  ParameterInformation,
  SignatureInformation,
  SignatureHelp,
  SemanticTokensLegend,
  SemanticTokensBuilder,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  workspace: {
    isTrusted: true,
    textDocuments: [] as unknown[],
    workspaceFolders: undefined as unknown,
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === "sharedModulesPath") return "";
        if (key === "enableAutoSync") return true;
        if (key === "autoFormatOnSave") return false;
        if (key === "exclude") return ["**/node_modules/**"];
        if (key === "diagnosticSeverity") return {};
        return undefined;
      },
      update: async (): Promise<void> => undefined,
    }),
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose: () => undefined }),
      onDidCreate: () => ({ dispose: () => undefined }),
      onDidDelete: () => ({ dispose: () => undefined }),
      dispose: () => undefined,
    }),
    onDidChangeConfiguration: () => ({ dispose: () => undefined }),
    onWillSaveTextDocument: () => ({ dispose: () => undefined }),
    openTextDocument: async (_path: string): Promise<unknown> => ({}),
    asRelativePath: (p: string): string => p,
    getWorkspaceFolder: (_uri: unknown): unknown => undefined,
  },
  window: {
    createOutputChannel: () => ({
      appendLine: (_: string): void => undefined,
      append: (_: string): void => undefined,
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
    showInformationMessage: async (
      _msg: string,
      ..._items: string[]
    ): Promise<string | undefined> => undefined,
    showWarningMessage: async (_msg: string, ..._items: string[]): Promise<string | undefined> =>
      undefined,
    showErrorMessage: async (_msg: string, ..._items: string[]): Promise<string | undefined> =>
      undefined,
    showQuickPick: async (_items: unknown, _opts?: unknown): Promise<unknown> => undefined,
    showOpenDialog: async (_opts: unknown): Promise<unknown> => undefined,
    showTextDocument: async (_doc: unknown): Promise<unknown> => undefined,
    withProgress: async <T>(
      _opts: unknown,
      task: (progress: { report: (v: unknown) => void }) => Promise<T>,
    ): Promise<T> => {
      return task({ report: () => undefined });
    },
    activeTextEditor: undefined as unknown,
  },
  languages: {
    getDiagnostics: (): [unknown, unknown[]][] => [],
    onDidChangeDiagnostics: (listener: (e: unknown) => void) => {
      diagnosticListeners.push(listener);
      return { dispose: () => undefined };
    },
    createDiagnosticCollection: () => ({
      set: (_uri: unknown, _diags: unknown[]): void => undefined,
      delete: (_uri: unknown): void => undefined,
      clear: (): void => undefined,
      dispose: (): void => undefined,
    }),
  },
  commands: {
    registerCommand: () => ({ dispose: () => undefined }),
    executeCommand: async (_cmd: string, ..._args: unknown[]): Promise<unknown> => undefined,
  },
  env: {
    clipboard: {
      writeText: async (_text: string): Promise<void> => undefined,
      readText: async (): Promise<string> => "",
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

// ===========================================================================
// Module.require override (only installed once)
// ===========================================================================

const originalRequire = Module.prototype.require;
let overrideInstalled = false;
if (!overrideInstalled) {
  (Module.prototype as unknown as { require: NodeJS.Require }).require = function (
    this: NodeModule,
    id: string,
  ) {
    if (id === "vscode") {
      return mockVsCode as unknown as NodeModule["exports"];
    }
    return originalRequire.apply(this, [id] as unknown as Parameters<NodeJS.Require>);
  } as unknown as NodeJS.Require;
  overrideInstalled = true;
}
