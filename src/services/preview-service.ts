import * as vscode from "vscode";
import { SugarTranspiler } from "../project/transpiler";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { detectEnumerable } from "../analysis/enumerable-detector";
import { readConfiguration } from "../infra/configuration";

export class D7PreviewContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = "data7-preview";

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  public triggerUpdate(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  public provideTextDocumentContent(
    uri: vscode.Uri,
    token: vscode.CancellationToken,
  ): vscode.ProviderResult<string> {
    if (token.isCancellationRequested) return "";

    const uriStr = uri.toString();
    let originalUri: vscode.Uri;

    const queryParams = new URLSearchParams(uri.query);
    if (queryParams.has("originalScheme")) {
      const originalScheme = queryParams.get("originalScheme") ?? "file";
      originalUri = uri.with({ scheme: originalScheme, query: "" });
    } else {
      // Legacy format parsing: data7-preview:file%3A...
      const schemePrefix = `${D7PreviewContentProvider.scheme}:`;
      if (!uriStr.startsWith(schemePrefix)) {
        return `Invalid preview URI: ${uriStr}`;
      }
      const originalUriStr = decodeURIComponent(uriStr.slice(schemePrefix.length));
      originalUri = vscode.Uri.parse(originalUriStr);
    }

    const liveDoc = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === originalUri.toString(),
    );

    if (liveDoc) {
      return this.transpileCode(liveDoc.getText());
    }

    return vscode.workspace.fs.readFile(originalUri).then(
      (uint8Array) => {
        const content = Buffer.from(uint8Array).toString("utf8");
        return this.transpileCode(content);
      },
      (err) => {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      },
    );
  }

  private transpileCode(rawCode: string): string {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const useAstGenerics = readConfiguration().experimentalUseAstGenerics;
    const transpileCtx = {
      detectEnumerable: (typeName: string, preferredElementType?: string) =>
        detectEnumerable(
          typeName,
          (t) => TypeResolver.getAllMembersForType(t, indexer),
          preferredElementType,
        ),
      useAstGenerics,
    };

    try {
      const transpiled = SugarTranspiler.transpile(rawCode, transpileCtx);
      return transpiled.code;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Error transpiling code:\n${msg}`;
    }
  }
}

export class PreviewService {
  private static provider: D7PreviewContentProvider;

  public static initialize(context: vscode.ExtensionContext): void {
    this.provider = new D7PreviewContentProvider();

    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        D7PreviewContentProvider.scheme,
        this.provider,
      ),
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (
          e.document.languageId === "d7basic" &&
          e.document.uri.scheme !== D7PreviewContentProvider.scheme
        ) {
          const previewUri = e.document.uri.with({
            scheme: D7PreviewContentProvider.scheme,
            query: `originalScheme=${e.document.uri.scheme}`,
          });
          this.provider.triggerUpdate(previewUri);
        }
      }),
    );
  }

  public static async showPreview(beside: boolean): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage(
        "Por favor, abra um arquivo Data7 Basic (.bas) para visualizar a prévia.",
      );
      return;
    }

    const doc = activeEditor.document;
    if (doc.languageId !== "d7basic" || doc.uri.scheme === D7PreviewContentProvider.scheme) {
      vscode.window.showWarningMessage(
        "Por favor, abra um arquivo Data7 Basic (.bas) válido para visualizar a prévia.",
      );
      return;
    }

    const previewUri = doc.uri.with({
      scheme: D7PreviewContentProvider.scheme,
      query: `originalScheme=${doc.uri.scheme}`,
    });

    try {
      const previewDoc = await vscode.workspace.openTextDocument(previewUri);
      await vscode.languages.setTextDocumentLanguage(previewDoc, "d7basic");
      await vscode.window.showTextDocument(previewDoc, {
        viewColumn: beside ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
        preserveFocus: true,
        preview: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Falha ao abrir visualização: ${msg}`);
    }
  }
}
