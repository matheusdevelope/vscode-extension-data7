import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  loadSourceMapForProjectFile,
  resolveGeneratedPositionFromProjectXml,
  wordAtColumn,
  type SourceMapLookup,
} from "@data7/core";

const lookupCache = new Map<
  string,
  { readonly mtimeMs: number; readonly lookup: SourceMapLookup }
>();

function workspaceFolderFor(document: vscode.TextDocument): string | undefined {
  return vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
}

function mapMtimeMs(projectPath: string, workspaceDir: string | undefined): number {
  const candidates = [`${projectPath}.map.json`];
  if (workspaceDir) {
    candidates.push(
      path.join(workspaceDir, ".data7", "build", path.basename(`${projectPath}.map.json`)),
    );
  }
  for (const candidate of candidates) {
    try {
      return fs.statSync(candidate).mtimeMs;
    } catch {
      continue;
    }
  }
  return 0;
}

export function clearSourceMapLookupCache(): void {
  lookupCache.clear();
}

export function getSourceMapLookupForDocument(
  document: vscode.TextDocument,
): SourceMapLookup | undefined {
  const projectPath = document.uri.fsPath;
  if (!projectPath) return undefined;

  const workspaceDir = workspaceFolderFor(document);
  const mtimeMs = mapMtimeMs(projectPath, workspaceDir);
  const cacheKey = `${projectPath}:${mtimeMs}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return cached.lookup;

  const lookup = loadSourceMapForProjectFile(projectPath, { workspaceDir });
  if (lookup) {
    lookupCache.set(cacheKey, { mtimeMs, lookup });
  }
  return lookup;
}

export interface ResolvedSourceMapContext {
  readonly moduleName: string;
  readonly generatedLine: number;
  readonly lineText: string;
  readonly word: string | undefined;
  readonly lookup: SourceMapLookup;
  readonly original: {
    readonly fileUri: string;
    readonly line: number;
    readonly column: number;
  };
}

export function resolveSourceMapContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): ResolvedSourceMapContext | undefined {
  const lookup = getSourceMapLookupForDocument(document);
  if (!lookup) return undefined;

  const generated = resolveGeneratedPositionFromProjectXml(
    document.getText(),
    position.line,
    position.character,
  );
  if (!generated) return undefined;

  const original = lookup.findOriginal(generated.moduleName, generated.line);
  if (!original || original.fileUri.startsWith("file:///synthetic/")) {
    return undefined;
  }

  return {
    moduleName: generated.moduleName,
    generatedLine: generated.line,
    lineText: generated.lineText,
    word: wordAtColumn(generated.lineText, generated.column),
    lookup,
    original,
  };
}
