import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7PreviewContentProvider, PreviewService } from "../../services/preview-service";
import { createMockDoc, resetMockWorkspace } from "../_helpers/mock-doc";

describe("PreviewService and D7PreviewContentProvider", () => {
  let registeredProviders: { scheme: string; provider: vscode.TextDocumentContentProvider }[] = [];
  let documentChangeListeners: ((e: vscode.TextDocumentChangeEvent) => void)[] = [];
  let selectionChangeListeners: ((e: vscode.TextEditorSelectionChangeEvent) => void)[] = [];
  let registeredCommands: { id: string; handler: (...args: any[]) => any }[] = [];
  let shownDocuments: { doc: any; showOptions?: any }[] = [];
  let openedDocuments: string[] = [];
  const mockFsReadData = new Map<string, string>();

  beforeEach(() => {
    registeredProviders = [];
    documentChangeListeners = [];
    selectionChangeListeners = [];
    registeredCommands = [];
    shownDocuments = [];
    openedDocuments = [];
    mockFsReadData.clear();
    resetMockWorkspace();

    // Mock Workspace functions
    (vscode.workspace as any).registerTextDocumentContentProvider = (
      scheme: string,
      provider: vscode.TextDocumentContentProvider,
    ) => {
      registeredProviders.push({ scheme, provider });
      return { dispose: () => {} };
    };

    (vscode.workspace as any).onDidChangeTextDocument = (
      listener: (e: vscode.TextDocumentChangeEvent) => void,
    ) => {
      documentChangeListeners.push(listener);
      return { dispose: () => {} };
    };

    (vscode.window as any).onDidChangeTextEditorSelection = (
      listener: (e: vscode.TextEditorSelectionChangeEvent) => void,
    ) => {
      selectionChangeListeners.push(listener);
      return { dispose: () => {} };
    };

    (vscode.window as any).visibleTextEditors = [];

    (vscode.workspace as any).openTextDocument = async (uri: string | vscode.Uri) => {
      const uriStr = typeof uri === "string" ? uri : uri.toString();
      openedDocuments.push(uriStr);
      // Return a minimal document-like object
      return {
        uri: vscode.Uri.parse(uriStr),
        languageId: "d7basic",
        getText: () => "mocked-content-of-open-doc",
      };
    };

    (vscode.workspace as any).fs = {
      readFile: async (uri: vscode.Uri) => {
        const key = uri.toString();
        if (mockFsReadData.has(key)) {
          const content = mockFsReadData.get(key)!;
          return Buffer.from(content, "utf-8");
        }
        throw new Error(`File not found in mock FS: ${key}`);
      },
    };

    // Mock Window functions
    (vscode.window as any).activeTextEditor = undefined;
    (vscode.window as any).showTextDocument = async (doc: any, options?: any) => {
      shownDocuments.push({ doc, showOptions: options });
      return {};
    };

    (vscode.window as any).showWarningMessage = async () => {
      return undefined;
    };
    (vscode.window as any).showErrorMessage = async () => {
      return undefined;
    };

    // Mock Commands functions
    (vscode.commands as any).registerCommand = (id: string, handler: (...args: any[]) => any) => {
      registeredCommands.push({ id, handler });
      return { dispose: () => {} };
    };
  });

  afterEach(() => {
    // Restore or clear mock references
    delete (vscode.workspace as any).registerTextDocumentContentProvider;
    delete (vscode.workspace as any).onDidChangeTextDocument;
    delete (vscode.workspace as any).fs;
    (vscode.window as any).activeTextEditor = undefined;
    delete (vscode.window as any).showWarningMessage;
    delete (vscode.window as any).showErrorMessage;
  });

  describe("D7PreviewContentProvider", () => {
    test("returns empty string if cancellation token is requested", async () => {
      const provider = new D7PreviewContentProvider();
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: true,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      const uri = vscode.Uri.parse("data7-preview:file%3A%2F%2F%2Fpath%2Fto%2Ffile.bas");
      const content = await provider.provideTextDocumentContent(uri, cancelToken);
      assert.equal(content, "");
    });

    test("returns invalid URI message if scheme is wrong", async () => {
      const provider = new D7PreviewContentProvider();
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };
      const uri = vscode.Uri.parse("file:///path/to/file.bas");
      const content = await provider.provideTextDocumentContent(uri, cancelToken);
      assert.match(content!, /Invalid preview URI/);
    });

    test("transpiles code from open text document (liveDoc)", async () => {
      const provider = new D7PreviewContentProvider();
      const originalUri = "file:///path/to/file.bas";
      // Create mock doc in the workspace (which registers it)
      createMockDoc(originalUri, "Dim x = (a > b) ? a : b");

      const previewUri = vscode.Uri.parse(`data7-preview:${encodeURIComponent(originalUri)}`);
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };

      const result = await provider.provideTextDocumentContent(previewUri, cancelToken);
      assert.ok(result);
      assert.ok(typeof result === "string");
      assert.match(result, /If \(a > b\) Then/);
      assert.match(result, /End If/);
    });

    test("transpiles code from open text document using new hierarchical URI format", async () => {
      const provider = new D7PreviewContentProvider();
      const originalUri = vscode.Uri.parse("file:///path/to/hierarchical_file.bas");
      createMockDoc(originalUri.toString(), "Dim x = (a > b) ? a : b");

      const previewUri = originalUri.with({
        scheme: D7PreviewContentProvider.scheme,
        query: `originalScheme=${originalUri.scheme}`,
      });
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };

      const result = await provider.provideTextDocumentContent(previewUri, cancelToken);
      assert.ok(result);
      assert.match(result, /If \(a > b\) Then/);
      assert.match(result, /End If/);
    });

    test("reads from file system if document is not open in workspace", async () => {
      const provider = new D7PreviewContentProvider();
      const originalUri = "file:///path/to/file_not_open.bas";
      mockFsReadData.set(originalUri, "Dim y As String");

      const previewUri = vscode.Uri.parse(`data7-preview:${encodeURIComponent(originalUri)}`);
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };

      const result = await provider.provideTextDocumentContent(previewUri, cancelToken);
      assert.ok(result);
      assert.match(result, /Dim y As/);
    });

    test("returns error message if file system read fails", async () => {
      const provider = new D7PreviewContentProvider();
      const originalUri = "file:///path/to/nonexistent.bas";

      const previewUri = vscode.Uri.parse(`data7-preview:${encodeURIComponent(originalUri)}`);
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };

      const result = await provider.provideTextDocumentContent(previewUri, cancelToken);
      assert.match(result!, /Error reading file/);
    });

    test("triggers onDidChange emitter on triggerUpdate", async () => {
      const provider = new D7PreviewContentProvider();
      let firedUri: any = undefined;
      provider.onDidChange((uri) => {
        firedUri = uri;
      });

      const uri = vscode.Uri.parse("data7-preview:file%3A%2F%2F%2Fpath%2Fto%2Ffile.bas");
      provider.triggerUpdate(uri);
      assert.equal(firedUri?.toString(), uri.toString());
    });
  });

  describe("PreviewService", () => {
    test("initialize registers text document provider, workspace change listener, and selection listener", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      assert.equal(registeredProviders.length, 1);
      assert.equal(registeredProviders[0]?.scheme, D7PreviewContentProvider.scheme);
      assert.equal(documentChangeListeners.length, 1);
      assert.equal(selectionChangeListeners.length, 1);
      assert.equal(context.subscriptions.length, 3);
    });

    test("workspace change listener fires triggerUpdate on preview provider for d7basic documents", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      const provider = (PreviewService as any).provider;
      let updatedUri: any = undefined;
      provider.onDidChange((uri: vscode.Uri) => {
        updatedUri = uri;
      });

      const mockBasDoc = createMockDoc("file:///path/to/my.bas", "some text");
      const changeEvent = {
        document: mockBasDoc,
        contentChanges: [],
      } as unknown as vscode.TextDocumentChangeEvent;

      documentChangeListeners[0]!(changeEvent);

      assert.ok(updatedUri);
      assert.equal(updatedUri.toString(), "data7-preview:///path/to/my.bas?originalScheme=file");
    });

    test("workspace change listener refreshes already-open previews when generic usages change elsewhere", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      const provider = (PreviewService as any).provider;
      const updatedUris: string[] = [];
      provider.onDidChange((uri: vscode.Uri) => {
        updatedUris.push(uri.toString());
      });

      const templateUri = vscode.Uri.parse("file:///path/to/mod_tlist.bas");
      const templatePreviewUri = templateUri.with({
        scheme: D7PreviewContentProvider.scheme,
        query: `originalScheme=${templateUri.scheme}`,
      });
      createMockDoc(templatePreviewUri.toString(), "transpiled template preview", {
        languageId: "d7basic",
      });

      const consumerDoc = createMockDoc(
        "file:///path/to/teste.bas",
        "Dim _listq As TTList<Produto>",
      );
      const changeEvent = {
        document: consumerDoc,
        contentChanges: [],
      } as unknown as vscode.TextDocumentChangeEvent;

      documentChangeListeners[0]!(changeEvent);

      assert.deepEqual(new Set(updatedUris), new Set([
        "data7-preview:///path/to/teste.bas?originalScheme=file",
        "data7-preview:///path/to/mod_tlist.bas?originalScheme=file",
      ]));
    });

    test("workspace change listener ignores non-d7basic documents and preview documents themselves", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      const provider = (PreviewService as any).provider;
      let updated = false;
      provider.onDidChange(() => {
        updated = true;
      });

      const docHtml = createMockDoc("file:///path/to/my.html", "some text", { languageId: "html" });
      documentChangeListeners[0]!({ document: docHtml, contentChanges: [] } as any);
      assert.equal(updated, false);

      const docPreview = createMockDoc("data7-preview:file%3A%2F%2F%2Fmy.bas", "some text", {
        languageId: "d7basic",
      });
      docPreview.uri.scheme = "data7-preview";
      documentChangeListeners[0]!({ document: docPreview, contentChanges: [] } as any);
      assert.equal(updated, false);
    });

    test("showPreview shows warning message if no active editor", async () => {
      (vscode.window as any).activeTextEditor = undefined;
      let warningMsg: string | undefined = undefined;
      (vscode.window as any).showWarningMessage = async (msg: string) => {
        warningMsg = msg;
        return undefined;
      };

      await PreviewService.showPreview(true);
      assert.match(warningMsg!, /Por favor, abra um arquivo Data7 Basic/);
    });

    test("showPreview shows warning message if active editor language is not d7basic", async () => {
      const doc = createMockDoc("file:///path/to/my.txt", "some text", { languageId: "plaintext" });
      (vscode.window as any).activeTextEditor = { document: doc };

      let warningMsg: string | undefined = undefined;
      (vscode.window as any).showWarningMessage = async (msg: string) => {
        warningMsg = msg;
        return undefined;
      };

      await PreviewService.showPreview(true);
      assert.match(warningMsg!, /Por favor, abra um arquivo Data7 Basic/);
    });

    test("showPreview opens and shows document beside active column", async () => {
      const doc = createMockDoc("file:///path/to/my.bas", "Dim x As Integer");
      (vscode.window as any).activeTextEditor = { document: doc };

      await PreviewService.showPreview(true);

      assert.equal(openedDocuments.length, 1);
      assert.equal(openedDocuments[0], "data7-preview:///path/to/my.bas?originalScheme=file");
      assert.equal(shownDocuments.length, 1);
      assert.equal(shownDocuments[0]!.showOptions?.viewColumn, vscode.ViewColumn.Beside);
    });

    test("showPreview opens and shows document in active column", async () => {
      const doc = createMockDoc("file:///path/to/my.bas", "Dim x As Integer");
      (vscode.window as any).activeTextEditor = { document: doc };

      await PreviewService.showPreview(false);

      assert.equal(openedDocuments.length, 1);
      assert.equal(openedDocuments[0], "data7-preview:///path/to/my.bas?originalScheme=file");
      assert.equal(shownDocuments.length, 1);
      assert.equal(shownDocuments[0]!.showOptions?.viewColumn, vscode.ViewColumn.Active);
    });

    test("getLineMap returns undefined before first transpilation", () => {
      const provider = new D7PreviewContentProvider();
      assert.equal(provider.getLineMap("file:///some/file.bas"), undefined);
    });

    test("getLineMap stores lineMap after transpilation", async () => {
      const provider = new D7PreviewContentProvider();
      const originalUri = "file:///path/to/lm.bas";
      createMockDoc(originalUri, "Dim z = (a > b) ? a : b");

      const previewUri = vscode.Uri.parse(`data7-preview:${encodeURIComponent(originalUri)}`);
      const cancelToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => {} }),
      };

      await provider.provideTextDocumentContent(previewUri, cancelToken);

      const lineMap = provider.getLineMap(originalUri);
      assert.ok(Array.isArray(lineMap), "lineMap should be an array after transpilation");
      assert.ok(lineMap!.length > 0, "lineMap should have entries");
    });

    test("cursor sync: selection change listener is registered and fires without error", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      // Make sure listener was registered.
      assert.equal(selectionChangeListeners.length, 1);

      // Fire it with a non-.bas editor — should be a no-op.
      const htmlDoc = createMockDoc("file:///some/file.html", "<html/>", { languageId: "html" });
      const htmlEditor = {
        document: htmlDoc,
        // Plain object matching the shape the sync listener needs
        selection: { active: { line: 5, character: 0 } },
        revealRange: () => {},
      };
      // Should not throw.
      selectionChangeListeners[0]!({ textEditor: htmlEditor, selections: [], kind: undefined } as any);
    });

    test("cursor sync: scrolls preview editor when source cursor moves", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      // Simulate a source document already transpiled with a known lineMap.
      const provider = (PreviewService as any).provider as D7PreviewContentProvider;
      const sourceUriStr = "file:///path/to/sync.bas";
      // lineMap[outputLine] = sourceLine: [0,0,1,2,2,3]
      (provider as any)._lineMaps.set(sourceUriStr, [0, 0, 1, 2, 2, 3]);

      // Create the source doc.
      const sourceDoc = createMockDoc(sourceUriStr, "some source");
      const previewUriStr = `data7-preview:///path/to/sync.bas?originalScheme=file`;
      const previewDoc = createMockDoc(previewUriStr, "some transpiled");
      previewDoc.uri.scheme = "data7-preview";

      let revealedRange: vscode.Range | undefined;
      const previewEditor = {
        document: previewDoc,
        selection: { active: { line: 0, character: 0 } },
        revealRange: (range: vscode.Range) => { revealedRange = range; },
      };

      // Mock visibleTextEditors so the sync listener finds the preview editor.
      (vscode.window as any).visibleTextEditors = [previewEditor];

      // Move cursor to source line 3 (0-based).
      const sourceEditor = {
        document: sourceDoc,
        selection: { active: { line: 3, character: 0 } },
        revealRange: () => {},
      };
      selectionChangeListeners[0]!({ textEditor: sourceEditor, selections: [], kind: undefined } as any);

      // lineMap[5] = 3, so outputLine 5 is the first line mapping to sourceLine 3.
      assert.ok(revealedRange, "preview editor revealRange should have been called");
      assert.equal(revealedRange!.start.line, 5);
    });
  });
});
