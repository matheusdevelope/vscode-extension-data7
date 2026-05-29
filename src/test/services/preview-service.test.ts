import "../_setup/global-hooks";
import { describe, test, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import * as vscode from "vscode";
import { D7PreviewContentProvider, PreviewService } from "../../services/preview-service";
import { createMockDoc, resetMockWorkspace } from "../_helpers/mock-doc";

describe("PreviewService and D7PreviewContentProvider", () => {
  let registeredProviders: { scheme: string; provider: vscode.TextDocumentContentProvider }[] = [];
  let documentChangeListeners: ((e: vscode.TextDocumentChangeEvent) => void)[] = [];
  let registeredCommands: { id: string; handler: (...args: any[]) => any }[] = [];
  let shownDocuments: { doc: any; showOptions?: any }[] = [];
  let openedDocuments: string[] = [];
  const mockFsReadData = new Map<string, string>();

  beforeEach(() => {
    registeredProviders = [];
    documentChangeListeners = [];
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
    test("initialize registers text document provider and workspace change listener", () => {
      const context = { subscriptions: [] as any[] } as vscode.ExtensionContext;
      PreviewService.initialize(context);

      assert.equal(registeredProviders.length, 1);
      assert.equal(registeredProviders[0]?.scheme, D7PreviewContentProvider.scheme);
      assert.equal(documentChangeListeners.length, 1);
      assert.equal(context.subscriptions.length, 2);
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
  });
});
