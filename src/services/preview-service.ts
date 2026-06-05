import * as vscode from "vscode";
import { SugarTranspiler } from "../project/transpiler";
import { WorkspaceSymbolIndexer } from "../analysis/symbol-indexer";
import { TypeResolver } from "../analysis/type-resolver";
import { detectEnumerable } from "../analysis/enumerable-detector";


export class D7PreviewContentProvider implements vscode.TextDocumentContentProvider {
  public static readonly scheme = "data7-preview";

  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Stores the last computed lineMap for each source URI string.
   * `lineMap[outputLine] = sourceLine` (both 0-based).
   * Populated every time the preview content is regenerated.
   */
  private readonly _lineMaps = new Map<string, number[]>();

  public triggerUpdate(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  /**
   * Returns the lineMap for the given source URI (file:// URI of the .bas file),
   * or undefined if no transpilation has been run yet for that file.
   */
  public getLineMap(sourceUriStr: string): number[] | undefined {
    return this._lineMaps.get(sourceUriStr);
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
      return this.transpileCode(liveDoc.getText(), originalUri.toString());
    }

    return vscode.workspace.fs.readFile(originalUri).then(
      (uint8Array) => {
        const content = Buffer.from(uint8Array).toString("utf8");
        return this.transpileCode(content, originalUri.toString());
      },
      (err) => {
        return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
      },
    );
  }

  private transpileCode(rawCode: string, sourceUriStr: string): string {
    const indexer = WorkspaceSymbolIndexer.getInstance();
    const transpileCtx = {
      detectEnumerable: (typeName: string, preferredElementType?: string) =>
        detectEnumerable(
          typeName,
          (t) => TypeResolver.getAllMembersForType(t, indexer),
          preferredElementType,
        ),
    };

    try {
      const transpiled = SugarTranspiler.transpile(rawCode, transpileCtx);
      // Cache the lineMap so the cursor sync listener can use it.
      if (transpiled.lineMap) {
        this._lineMaps.set(sourceUriStr, transpiled.lineMap);
      }
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

    // Re-transpile when the source file changes (existing behaviour).
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (
          (e.document.languageId === "d7basic" || e.document.fileName?.endsWith(".bas")) &&
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

    // -----------------------------------------------------------------------
    // Cursor synchronization: source editor → preview editor
    // -----------------------------------------------------------------------
    context.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        PreviewService.syncCursorToPreview(e.textEditor);
      }),
    );
  }

  /**
   * Given the source editor, finds the corresponding preview editor (if open
   * and visible), maps the cursor line through the stored lineMap and reveals
   * the equivalent line in the preview — without stealing focus.
   */
  private static syncCursorToPreview(sourceEditor: vscode.TextEditor): void {
    const doc = sourceEditor.document;

    // Only act on source .bas files, never on the preview itself.
    if (
      (doc.languageId !== "d7basic" && !doc.fileName?.endsWith(".bas")) ||
      doc.uri.scheme === D7PreviewContentProvider.scheme
    ) {
      return;
    }

    const previewUri = doc.uri.with({
      scheme: D7PreviewContentProvider.scheme,
      query: `originalScheme=${doc.uri.scheme}`,
    });
    const previewUriStr = previewUri.toString();

    // Find the preview editor (it must be visible but we allow any column).
    const previewEditor = vscode.window.visibleTextEditors.find(
      (ed) => ed.document.uri.toString() === previewUriStr,
    );
    if (!previewEditor) return;

    const sourceLine = sourceEditor.selection.active.line; // 0-based

    // Retrieve the cached lineMap (lineMap[outputLine] = sourceLine).
    const lineMap = this.provider.getLineMap(doc.uri.toString());

    let targetLine: number;
    if (lineMap && lineMap.length > 0) {
      // Build inverted map: sourceLine → best matching outputLine.
      // We pick the first output line that maps to the closest source line
      // (could be exact or the nearest preceding).
      targetLine = PreviewService.invertLineMap(lineMap, sourceLine);
    } else {
      // Fallback: no map available yet (first open before content loads).
      // Use same line number as a heuristic.
      targetLine = sourceLine;
    }

    const targetPosition = new vscode.Position(targetLine, 0);
    const targetRange = new vscode.Range(targetPosition, targetPosition);

    previewEditor.revealRange(targetRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /**
   * Given `lineMap` where `lineMap[outputLine] = sourceLine`, finds the
   * output line that best corresponds to `sourceLine`.
   *
   * Strategy: scan `lineMap` and find the output line whose source line
   * equals or is the closest preceding source line (handles 1-to-many and
   * many-to-1 expansions by the transpiler).
   */
  private static invertLineMap(lineMap: number[], sourceLine: number): number {
    let bestOutputLine = 0;
    let bestDistance = Infinity;

    for (let outputLine = 0; outputLine < lineMap.length; outputLine++) {
      const mapped = lineMap[outputLine];
      if (mapped === undefined) continue;

      // Exact match wins immediately.
      if (mapped === sourceLine) return outputLine;

      // Otherwise prefer the closest preceding source line.
      if (mapped <= sourceLine) {
        const distance = sourceLine - mapped;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestOutputLine = outputLine;
        }
      }
    }

    return bestOutputLine;
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
    if (
      (doc.languageId !== "d7basic" && !doc.fileName?.endsWith(".bas")) ||
      doc.uri.scheme === D7PreviewContentProvider.scheme
    ) {
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
