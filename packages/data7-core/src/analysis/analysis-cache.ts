import * as path from "node:path";
import { logger } from "../infra/logger";
import { hashContent } from "../utils/content-hash";
import { getAnalysisHost } from "./analysis-host";
import type { FileSymbols, SymbolInfo } from "./symbol-indexer";

interface PersistedSymbolEntry {
  readonly fileUri: string;
  readonly contentHash: string;
  readonly imports: readonly string[];
  readonly symbols: readonly SymbolInfo[];
}

interface AnalysisCacheFile {
  readonly version: 1;
  readonly entries: readonly PersistedSymbolEntry[];
}

const CACHE_VERSION = 1 as const;
const CACHE_DIR_NAME = ".data7";
const CACHE_FILE_NAME = "analysis-cache.json";

/**
 * Optional on-disk symbol index under `.data7/analysis-cache.json`.
 * Stores metadata only (not diagnostics). Invalidated per-file by content hash.
 */
export class AnalysisCache {
  public static resolveCachePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, CACHE_DIR_NAME, CACHE_FILE_NAME);
  }

  public static load(workspaceRoot: string): Map<string, PersistedSymbolEntry> {
    const result = new Map<string, PersistedSymbolEntry>();
    const cachePath = this.resolveCachePath(workspaceRoot);
    try {
      const hostFs = getAnalysisHost().fs;
      if (!hostFs.existsSync(cachePath)) return result;
      const raw = hostFs.readFileSync(cachePath);
      const parsed = JSON.parse(raw) as AnalysisCacheFile;
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) {
        return result;
      }
      for (const entry of parsed.entries) {
        if (entry?.fileUri && entry.contentHash) {
          result.set(entry.fileUri.toLowerCase(), entry);
        }
      }
    } catch (err) {
      logger.warn(`Falha ao ler analysis-cache: ${String(err)}`);
    }
    return result;
  }

  public static tryGetFresh(
    cache: Map<string, PersistedSymbolEntry>,
    fileUri: string,
    content: string,
  ): FileSymbols | undefined {
    const entry = cache.get(fileUri.toLowerCase());
    if (!entry) return undefined;
    if (entry.contentHash !== hashContent(content)) return undefined;
    return {
      fileUri: entry.fileUri,
      filePath: fileUri.startsWith("file:")
        ? // best-effort; caller may overwrite
          entry.fileUri
        : entry.fileUri,
      content,
      imports: [...entry.imports],
      symbols: entry.symbols.map((s) => ({ ...s })),
    };
  }

  public static save(
    workspaceRoot: string,
    files: readonly {
      readonly fileUri: string;
      readonly content: string;
      readonly symbols: FileSymbols;
    }[],
  ): void {
    const cacheDir = path.join(workspaceRoot, CACHE_DIR_NAME);
    try {
      const hostFs = getAnalysisHost().fs;
      hostFs.mkdirSync(cacheDir, { recursive: true });
      const payload: AnalysisCacheFile = {
        version: CACHE_VERSION,
        entries: files.map((file) => ({
          fileUri: file.fileUri,
          contentHash: hashContent(file.content),
          imports: [...file.symbols.imports],
          symbols: file.symbols.symbols,
        })),
      };
      hostFs.writeFileSync(this.resolveCachePath(workspaceRoot), JSON.stringify(payload));
    } catch (err) {
      logger.warn(`Falha ao gravar analysis-cache: ${String(err)}`);
    }
  }
}
