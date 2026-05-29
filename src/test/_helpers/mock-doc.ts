import * as vscode from "vscode";

/**
 * Helpers that fabricate `vscode.TextDocument`-shaped objects for in-process
 * provider/linter tests. Exposing them once (instead of redefining a slight
 * variation in every test file) avoids drift across the suite.
 */

/** Strongly-typed alias for the underlying mock array. */
export const mockTextDocuments = vscode.workspace.textDocuments as unknown as unknown[];

/** Cancellation token that never fires. */
export const noopToken: vscode.CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: (): { dispose(): void } => ({ dispose: () => undefined }),
};

/** Options for {@link createMockDoc}. */
export interface MockDocOptions {
  /** When `false`, do not push the document into `mockTextDocuments`. Defaults to `true`. */
  register?: boolean;
  /** Language ID exposed by the mock. Defaults to `'d7basic'`. */
  languageId?: string;
}

/**
 * Lightweight stand-in for `vscode.TextDocument`. The returned object is typed
 * as `any` because we do not implement every method of the real interface;
 * only the surface actually exercised by production code is present.
 *
 * Side effect: pushes the document into `vscode.workspace.textDocuments` so the
 * `WorkspaceSymbolIndexer.isFileValid()` check accepts it. Disable via
 * `opts.register === false` when the test doesn't care about indexer validity.
 */
export function createMockDoc(uri: string, text: string, opts: MockDocOptions = {}): any {
  const lines = text.split(/\r?\n/);
  const register = opts.register ?? true;

  const doc = {
    uri: vscode.Uri.parse(uri),
    languageId: opts.languageId ?? "d7basic",
    lineCount: lines.length,
    getText: (range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    }) => {
      if (!range) return text;
      const lineText = lines[range.start.line] ?? "";
      return lineText.substring(range.start.character, range.end.character);
    },
    lineAt: (i: number) => ({
      text: lines[i] ?? "",
      range: {
        start: { line: i, character: 0 },
        end: { line: i, character: (lines[i] ?? "").length },
      },
    }),
    getWordRangeAtPosition: (pos: { line: number; character: number }) => {
      const line = lines[pos.line] ?? "";
      const wordRegex = /[A-Za-z_]\w*/g;
      let m: RegExpExecArray | null;
      while ((m = wordRegex.exec(line)) !== null) {
        if (pos.character >= m.index && pos.character <= m.index + m[0].length) {
          return {
            start: { line: pos.line, character: m.index },
            end: { line: pos.line, character: m.index + m[0].length },
          };
        }
      }
      return undefined;
    },
  };

  if (register) mockTextDocuments.push(doc);
  return doc;
}

/**
 * Quick helper to register a "phantom" open document — same as `createMockDoc`
 * but without the rich `TextDocument` surface. Useful when the indexer needs
 * to see a file as "open" but no provider will ever read its body.
 */
export function registerOpenDocument(uri: string, _fsPath?: string): void {
  mockTextDocuments.push({
    uri: vscode.Uri.parse(uri),
  });
}

/** Clears every registered mock document. */
export function resetMockWorkspace(): void {
  mockTextDocuments.length = 0;
}

/**
 * Constructs a typed `vscode.Position`. Avoids `{ line, character } as any`
 * boilerplate in test call sites.
 */
export function pos(line: number, character: number): vscode.Position {
  return new vscode.Position(line, character);
}

/**
 * Constructs a typed `vscode.ReferenceContext`. Avoids
 * `{ includeDeclaration: true } as any` boilerplate.
 */
export function refContext(includeDeclaration: boolean): vscode.ReferenceContext {
  return { includeDeclaration };
}

/** Empty `vscode.FoldingContext` for folding-range provider calls. */
export function foldingContext(): vscode.FoldingContext {
  return {};
}
