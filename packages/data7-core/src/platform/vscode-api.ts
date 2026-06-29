import * as path from "node:path";

export interface Disposable {
  dispose(): void;
}

export class Position {
  public constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}

  public isBefore(other: Position): boolean {
    return this.compareTo(other) < 0;
  }

  public isBeforeOrEqual(other: Position): boolean {
    return this.compareTo(other) <= 0;
  }

  public isAfter(other: Position): boolean {
    return this.compareTo(other) > 0;
  }

  public isAfterOrEqual(other: Position): boolean {
    return this.compareTo(other) >= 0;
  }

  public isEqual(other: Position): boolean {
    return this.compareTo(other) === 0;
  }

  public compareTo(other: Position): number {
    if (this.line !== other.line) return this.line - other.line;
    return this.character - other.character;
  }

  public translate(lineDelta?: number, characterDelta?: number): Position;
  public translate(change: {
    readonly lineDelta?: number;
    readonly characterDelta?: number;
  }): Position;
  public translate(
    lineDeltaOrChange:
      | number
      | { readonly lineDelta?: number; readonly characterDelta?: number } = 0,
    characterDelta = 0,
  ): Position {
    if (typeof lineDeltaOrChange === "number") {
      return new Position(this.line + lineDeltaOrChange, this.character + characterDelta);
    }
    return new Position(
      this.line + (lineDeltaOrChange.lineDelta ?? 0),
      this.character + (lineDeltaOrChange.characterDelta ?? 0),
    );
  }

  public with(line?: number, character?: number): Position;
  public with(change: { readonly line?: number; readonly character?: number }): Position;
  public with(
    lineOrChange: number | { readonly line?: number; readonly character?: number } = this.line,
    character = this.character,
  ): Position {
    if (typeof lineOrChange === "number") {
      return new Position(lineOrChange, character);
    }
    return new Position(lineOrChange.line ?? this.line, lineOrChange.character ?? this.character);
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  public constructor(start: Position, end: Position);
  public constructor(
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
  );
  public constructor(
    startLineOrStart: number | Position,
    startCharacterOrEnd: number | Position,
    endLine?: number,
    endCharacter?: number,
  ) {
    if (typeof startLineOrStart === "number") {
      this.start = new Position(startLineOrStart, startCharacterOrEnd as number);
      this.end = new Position(
        endLine ?? startLineOrStart,
        endCharacter ?? (startCharacterOrEnd as number),
      );
      return;
    }

    this.start = startLineOrStart;
    this.end = startCharacterOrEnd as Position;
  }

  public get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  public get isSingleLine(): boolean {
    return this.start.line === this.end.line;
  }

  public contains(positionOrRange: Position | Range): boolean {
    if (positionOrRange instanceof Range) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }
    return this.start.isBeforeOrEqual(positionOrRange) && this.end.isAfterOrEqual(positionOrRange);
  }

  public isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  public intersection(other: Range): Range | undefined {
    const start = this.start.isAfter(other.start) ? this.start : other.start;
    const end = this.end.isBefore(other.end) ? this.end : other.end;
    return start.isAfter(end) ? undefined : new Range(start, end);
  }

  public union(other: Range): Range {
    const start = this.start.isBefore(other.start) ? this.start : other.start;
    const end = this.end.isAfter(other.end) ? this.end : other.end;
    return new Range(start, end);
  }

  public with(start?: Position, end?: Position): Range;
  public with(change: { readonly start?: Position; readonly end?: Position }): Range;
  public with(
    startOrChange: Position | { readonly start?: Position; readonly end?: Position } = this.start,
    end = this.end,
  ): Range {
    if (startOrChange instanceof Position) {
      return new Range(startOrChange, end);
    }
    return new Range(startOrChange.start ?? this.start, startOrChange.end ?? this.end);
  }
}

export class Location {
  public constructor(
    public readonly uri: Uri,
    public readonly range: Range,
  ) {}
}

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
} as const;

export type DiagnosticSeverity = (typeof DiagnosticSeverity)[keyof typeof DiagnosticSeverity];

export const DiagnosticTag = {
  Unnecessary: 1,
  Deprecated: 2,
} as const;

export type DiagnosticTag = (typeof DiagnosticTag)[keyof typeof DiagnosticTag];

export interface DiagnosticRelatedInformation {
  readonly location: Location;
  readonly message: string;
}

export class Diagnostic {
  public code?: string | number | { value: string | number; target: Uri };
  public source?: string;
  public tags?: DiagnosticTag[];
  public relatedInformation?: DiagnosticRelatedInformation[];
  public data?: unknown;

  public constructor(
    public readonly range: Range,
    public readonly message: string,
    public severity: DiagnosticSeverity,
  ) {}
}

export const EndOfLine = {
  LF: 1,
  CRLF: 2,
} as const;

export type EndOfLine = (typeof EndOfLine)[keyof typeof EndOfLine];

export class TextEdit {
  public static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }

  public static insert(position: Position, newText: string): TextEdit {
    return new TextEdit(new Range(position, position), newText);
  }

  public constructor(
    public readonly range: Range,
    public readonly newText: string,
  ) {}
}

const uriValues = new WeakMap<Uri, string>();

export class Uri {
  public static file(filePath: string): Uri {
    const normalized = filePath.replace(/\\/g, "/");
    const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
    return new Uri("file", `file://${withLeadingSlash}`, filePath, "", withLeadingSlash, "", "");
  }

  public static parse(value: string): Uri {
    const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
    const scheme = schemeMatch?.[1] ?? "";
    if (scheme.toLowerCase() !== "file") {
      return new Uri(scheme, value, value, "", value, "", "");
    }

    const decoded = decodeURIComponent(value);
    const stripped = decoded.replace(/^file:\/+/, "");
    const fsPath =
      process.platform === "win32"
        ? stripped.replace(/\//g, "\\")
        : path.posix.join("/", stripped.replace(/\\/g, "/"));
    return new Uri("file", value, fsPath, "", stripped, "", "");
  }

  private constructor(
    public readonly scheme: string,
    value: string,
    public readonly fsPath: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
  ) {
    uriValues.set(this, value);
  }

  public toString(): string {
    return uriValues.get(this) ?? "";
  }

  public toJSON(): string {
    return this.toString();
  }

  public with(change: {
    readonly scheme?: string;
    readonly authority?: string;
    readonly path?: string;
    readonly query?: string;
    readonly fragment?: string;
  }): Uri {
    const scheme = change.scheme ?? this.scheme;
    const authority = change.authority ?? this.authority;
    const uriPath = change.path ?? this.path;
    const query = change.query ?? this.query;
    const fragment = change.fragment ?? this.fragment;
    const queryText = query ? `?${query}` : "";
    const fragmentText = fragment ? `#${fragment}` : "";
    const value = `${scheme}://${authority}${uriPath}${queryText}${fragmentText}`;
    return new Uri(
      scheme,
      value,
      scheme === "file" ? uriPath : value,
      authority,
      uriPath,
      query,
      fragment,
    );
  }
}

export const SymbolKind = {
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
} as const;

export type SymbolKind = (typeof SymbolKind)[keyof typeof SymbolKind];

export interface TextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: Range;
  readonly rangeIncludingLineBreak: Range;
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}

export interface TextDocument {
  readonly uri: Uri;
  readonly fileName: string;
  readonly isUntitled: boolean;
  readonly languageId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isClosed: boolean;
  readonly encoding: string;
  readonly eol: EndOfLine;
  readonly lineCount: number;
  getText(range?: Range): string;
  lineAt(lineOrPosition: number | Position): TextLine;
  offsetAt(position: Position): number;
  positionAt(offset: number): Position;
  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined;
  validateRange(range: Range): Range;
  validatePosition(position: Position): Position;
  save(): Thenable<boolean>;
}

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

export interface WorkspaceConfiguration {
  get<T>(section: string): T | undefined;
  has(section: string): boolean;
  inspect<T>(section: string):
    | {
        readonly key: string;
        readonly defaultValue?: T;
        readonly globalValue?: T;
        readonly workspaceValue?: T;
        readonly workspaceFolderValue?: T;
        readonly defaultLanguageValue?: T;
        readonly globalLanguageValue?: T;
        readonly workspaceLanguageValue?: T;
        readonly workspaceFolderLanguageValue?: T;
        readonly languageIds?: string[];
      }
    | undefined;
  update(section: string, value: unknown, configurationTarget?: unknown): Thenable<void>;
}

export interface OutputChannel extends Disposable {
  appendLine(value: string): void;
  append(value: string): void;
  show(preserveFocus?: boolean): void;
}

export interface ExtensionContext {
  readonly extensionUri: Uri;
  readonly globalStorageUri: Uri;
  readonly subscriptions: Disposable[];
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string): boolean;
}

export interface WorkspaceApi {
  isTrusted: boolean;
  textDocuments: TextDocument[];
  workspaceFolders: readonly WorkspaceFolder[] | undefined;
  getConfiguration(section?: string): WorkspaceConfiguration;
  onDidChangeConfiguration(listener: (event: ConfigurationChangeEvent) => void): Disposable;
  asRelativePath(pathOrUri: string | Uri): string;
}

export interface WindowApi {
  createOutputChannel(name: string): OutputChannel;
}

export interface CommandsApi {
  executeCommand(command: string, ...args: unknown[]): Thenable<unknown>;
}

export interface VscodeApi {
  readonly workspace: WorkspaceApi;
  readonly window: WindowApi;
  readonly commands: CommandsApi;
}

const noopDisposable: Disposable = { dispose: () => undefined };

const nullConfiguration: WorkspaceConfiguration = {
  get: <T>(): T | undefined => undefined,
  has: (): boolean => false,
  inspect: () => undefined,
  update: (): Thenable<void> => Promise.resolve(),
};

const nullChannel: OutputChannel = {
  appendLine: () => undefined,
  append: () => undefined,
  show: () => undefined,
  dispose: () => undefined,
};

const defaultApi: VscodeApi = {
  workspace: {
    isTrusted: true,
    textDocuments: [],
    workspaceFolders: undefined,
    getConfiguration: () => nullConfiguration,
    onDidChangeConfiguration: () => noopDisposable,
    asRelativePath: (pathOrUri) => (typeof pathOrUri === "string" ? pathOrUri : pathOrUri.fsPath),
  },
  window: {
    createOutputChannel: () => nullChannel,
  },
  commands: {
    executeCommand: (): Thenable<unknown> => Promise.resolve(undefined),
  },
};

let activeApi: VscodeApi = defaultApi;

export function installVscodeApi(api: VscodeApi): void {
  activeApi = api;
}

export const workspace: WorkspaceApi = new Proxy(defaultApi.workspace, {
  get: (_target, prop: keyof WorkspaceApi) => activeApi.workspace[prop],
  set: (_target, prop: keyof WorkspaceApi, value: WorkspaceApi[keyof WorkspaceApi]) => {
    (
      activeApi.workspace as unknown as Record<keyof WorkspaceApi, WorkspaceApi[keyof WorkspaceApi]>
    )[prop] = value;
    return true;
  },
});

export const window: WindowApi = new Proxy(defaultApi.window, {
  get: (_target, prop: keyof WindowApi) => activeApi.window[prop],
});

export const commands: CommandsApi = new Proxy(defaultApi.commands, {
  get: (_target, prop: keyof CommandsApi) => activeApi.commands[prop],
});
