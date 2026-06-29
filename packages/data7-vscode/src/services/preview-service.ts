import * as vscode from "vscode";
import {
  SugarTranspiler,
  TypeResolver,
  WorkspaceSymbolIndexer,
  collectGenericsContext,
  detectEnumerable,
  lookupSystemByName,
  readConfiguration,
} from "@data7/core";
import type { ExternalGenericTemplate, RequestedGenericInstantiation } from "@data7/core";

const PREVIEW_PRIMITIVE_TYPE_NAMES = new Set([
  "boolean",
  "byte",
  "currency",
  "date",
  "double",
  "integer",
  "long",
  "single",
  "string",
  "tdatetime",
  "variant",
  "void",
]);

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
    indexer.updateFileContent(sourceUriStr, rawCode);
    refreshIndexerFromOpenDocuments(indexer);
    const configuration = readConfiguration();
    const genericsEnabled = configuration.features.language.generics;
    const externalGenericTemplates = genericsEnabled
      ? collectExternalGenericTemplates(indexer)
      : [];
    const sugarConfig = configuration.sugars;
    const transpileCtx = {
      detectEnumerable: (typeName: string, preferredElementType?: string) =>
        detectEnumerable(
          typeName,
          (t) => TypeResolver.getAllMembersForType(t, indexer),
          preferredElementType,
        ),
      isTypeDescendantOf: (typeName: string, baseTypeName: string) =>
        TypeResolver.isSubclassOf(typeName, baseTypeName, indexer),
      resolveGlobalSymbolType: (name: string, argumentCount: number) =>
        indexer.findSymbolByName(name)?.type ??
        lookupSystemByName(name).find(
          (symbol) =>
            !symbol.containerName &&
            (!symbol.parameters || symbol.parameters.length === argumentCount),
        )?.type,
      resolveMemberType: (typeName: string, name: string, argumentCount: number) =>
        TypeResolver.findMember(typeName, name, indexer, argumentCount)?.type,
      externalGenericTemplates,
      requestedGenericInstantiations: genericsEnabled
        ? collectRequestedGenericInstantiations(indexer, externalGenericTemplates)
        : [],
      genericsEnabled,
      sugarOptions: {
        enabled: configuration.features.language.sugars && sugarConfig.enabled,
        enabledSugarIds: sugarConfig.enabledIds,
        disabledSugarIds: sugarConfig.disabledIds,
      },
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

function collectExternalGenericTemplates(
  indexer: WorkspaceSymbolIndexer,
): ExternalGenericTemplate[] {
  const templates: ExternalGenericTemplate[] = [];
  const seen = new Set<string>();
  for (const sym of indexer.getAllSymbols()) {
    if (sym.kind !== "class" && sym.kind !== "delegate" && sym.kind !== "method") {
      continue;
    }
    if (!sym.genericTypeParameters || sym.genericTypeParameters.length === 0) continue;
    const key = sym.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    templates.push({ name: sym.name, typeParams: sym.genericTypeParameters });
  }
  return templates;
}

function collectRequestedGenericInstantiations(
  indexer: WorkspaceSymbolIndexer,
  externalGenericTemplates: readonly ExternalGenericTemplate[],
): RequestedGenericInstantiation[] {
  const requests: RequestedGenericInstantiation[] = [];
  const seen = new Set<string>();
  const workspaceTemplateNames = new Set(
    externalGenericTemplates.map((template) => template.name.toLowerCase()),
  );
  const openTypeParams = collectOpenTypeParams(externalGenericTemplates);
  const analysisTemplates = externalGenericTemplates.map((template) => ({
    kind: "class" as const,
    name: template.name,
    typeParams: template.typeParams,
    line: 0,
  }));

  for (const fileSyms of indexer.getAllFileSymbols()) {
    const ctx = collectGenericsContext(fileSyms.content, {
      externalTemplates: analysisTemplates,
    });
    for (const usage of ctx.usages) {
      if (!workspaceTemplateNames.has(usage.templateName.toLowerCase())) continue;
      if (hasOpenGenericTypeArgument(usage.typeArgs, openTypeParams)) continue;
      const key = `${usage.templateName.toLowerCase()}<${usage.typeArgs.join(",")}>`;
      if (seen.has(key)) continue;
      seen.add(key);
      const qualifiedTypeArgs = usage.typeArgs.map((typeArg) =>
        qualifyGenericTypeArgument(typeArg, fileSyms.fileUri, indexer),
      );
      requests.push({
        templateName: usage.templateName,
        typeArgs: qualifiedTypeArgs,
        flatTypeArgs: usage.typeArgs,
      });
    }
  }
  return requests;
}

function qualifyGenericTypeArgument(
  typeArg: string,
  contextFileUri: string,
  indexer: WorkspaceSymbolIndexer,
): string {
  const trimmed = typeArg.trim();
  if (!trimmed || trimmed.includes(".")) return typeArg;
  if (PREVIEW_PRIMITIVE_TYPE_NAMES.has(trimmed.toLowerCase())) return typeArg;

  const symbol = indexer.findSymbolByName(trimmed, contextFileUri);
  if (!symbol?.containerName) return typeArg;
  if (symbol.isSyntheticGenericInstantiation) return typeArg;
  if (symbol.kind !== "class" && symbol.kind !== "structure" && symbol.kind !== "delegate") {
    return typeArg;
  }
  return `${symbol.containerName}.${trimmed}`;
}

function collectOpenTypeParams(templates: readonly ExternalGenericTemplate[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const template of templates) {
    for (const typeParam of template.typeParams) {
      result.add(typeParam.toLowerCase());
    }
  }
  return result;
}

function hasOpenGenericTypeArgument(
  typeArgs: readonly string[],
  openTypeParams: ReadonlySet<string>,
): boolean {
  return typeArgs.some((typeArg) => openTypeParams.has(typeArg.toLowerCase()));
}

function isData7SourceDocument(doc: vscode.TextDocument): boolean {
  const fileName = getDocumentFileName(doc);
  return (
    (doc.languageId === "d7basic" || fileName.toLowerCase().endsWith(".bas")) &&
    doc.uri.scheme !== D7PreviewContentProvider.scheme
  );
}

function getDocumentFileName(doc: vscode.TextDocument): string {
  const maybeDoc = doc as unknown as {
    fileName?: string;
    uri?: { fsPath?: string; path?: string };
  };
  return maybeDoc.fileName ?? maybeDoc.uri?.fsPath ?? maybeDoc.uri?.path ?? "";
}

function refreshIndexerFromOpenDocuments(indexer: WorkspaceSymbolIndexer): void {
  for (const doc of vscode.workspace.textDocuments) {
    if (!isData7SourceDocument(doc)) continue;
    indexer.updateFileContent(doc.uri.toString(), doc.getText());
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
        if (!isData7SourceDocument(e.document)) return;

        const indexer = WorkspaceSymbolIndexer.getInstance();
        indexer.updateFileContent(e.document.uri.toString(), e.document.getText());
        this.triggerPreviewUpdates(e.document.uri);
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
    const fileName = getDocumentFileName(doc);
    if (
      (doc.languageId !== "d7basic" && !fileName.toLowerCase().endsWith(".bas")) ||
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

  private static getPreviewUriForSource(sourceUri: vscode.Uri): vscode.Uri {
    return sourceUri.with({
      scheme: D7PreviewContentProvider.scheme,
      query: `originalScheme=${sourceUri.scheme}`,
    });
  }

  private static triggerPreviewUpdates(changedSourceUri: vscode.Uri): void {
    const uris = new Map<string, vscode.Uri>();
    const add = (uri: vscode.Uri): void => {
      uris.set(uri.toString(), uri);
    };

    add(this.getPreviewUriForSource(changedSourceUri));

    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === D7PreviewContentProvider.scheme) {
        add(doc.uri);
      }
    }

    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.scheme === D7PreviewContentProvider.scheme) {
        add(editor.document.uri);
      }
    }

    for (const uri of uris.values()) {
      this.provider.triggerUpdate(uri);
    }
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
    if (!readConfiguration().features.preview.enabled) {
      void vscode.window.showWarningMessage(
        "A prévia de código transpilado está desativada em data7.features.preview.enabled.",
      );
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage(
        "Por favor, abra um arquivo Data7 Basic (.bas) para visualizar a prévia.",
      );
      return;
    }

    const doc = activeEditor.document;
    const fileName = getDocumentFileName(doc);
    if (
      (doc.languageId !== "d7basic" && !fileName.toLowerCase().endsWith(".bas")) ||
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
