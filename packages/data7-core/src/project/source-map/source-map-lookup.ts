import type { Data7SourceMap, Data7SourcePosition, Data7SymbolMapping } from "./data7-source-map";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePosition(
  value: unknown,
  keys: { readonly line: string; readonly column: string },
): { line: number; column: number } | undefined {
  if (!isRecord(value)) return undefined;
  const line = value[keys.line];
  const column = value[keys.column];
  if (typeof line !== "number" || typeof column !== "number") return undefined;
  return { line, column };
}

/**
 * Validate and narrow unknown JSON into {@link Data7SourceMap}.
 * Returns `undefined` when the shape is not a usable Data7 source map.
 */
export function parseData7SourceMap(json: unknown): Data7SourceMap | undefined {
  if (!isRecord(json)) return undefined;
  if (json.version !== 1) return undefined;
  if (typeof json.generatedProjectFile !== "string") return undefined;
  if (!Array.isArray(json.segments) || !Array.isArray(json.symbols)) return undefined;

  const segments: Array<{
    readonly generated: {
      readonly moduleName: string;
      readonly line: number;
      readonly column: number;
    };
    readonly original: {
      readonly fileUri: string;
      readonly line: number;
      readonly column: number;
    };
  }> = [];
  for (const entry of json.segments) {
    if (!isRecord(entry) || !isRecord(entry.generated) || !isRecord(entry.original)) {
      return undefined;
    }
    const generatedPos = parsePosition(entry.generated, { line: "line", column: "column" });
    const originalPos = parsePosition(entry.original, { line: "line", column: "column" });
    if (!generatedPos || !originalPos) return undefined;
    if (typeof entry.generated.moduleName !== "string") return undefined;
    if (typeof entry.original.fileUri !== "string") return undefined;
    segments.push({
      generated: {
        moduleName: entry.generated.moduleName,
        line: generatedPos.line,
        column: generatedPos.column,
      },
      original: {
        fileUri: entry.original.fileUri,
        line: originalPos.line,
        column: originalPos.column,
      },
    });
  }

  const symbols: Data7SymbolMapping[] = [];
  for (const entry of json.symbols) {
    if (!isRecord(entry)) return undefined;
    if (typeof entry.originalName !== "string") return undefined;
    if (typeof entry.generatedName !== "string") return undefined;
    if (typeof entry.kind !== "string") return undefined;
    if (typeof entry.fileUri !== "string") return undefined;
    symbols.push({
      originalName: entry.originalName,
      generatedName: entry.generatedName,
      kind: entry.kind,
      fileUri: entry.fileUri,
      ...(typeof entry.scope === "string" ? { scope: entry.scope } : {}),
    });
  }

  return {
    version: 1,
    generatedProjectFile: json.generatedProjectFile,
    segments,
    symbols,
  };
}

/**
 * Indexed reverse lookup over a {@link Data7SourceMap}.
 */
export class SourceMapLookup {
  private readonly byGeneratedLine = new Map<string, Data7SourcePosition>();
  private readonly symbolsByGeneratedLower = new Map<string, Data7SymbolMapping[]>();

  private constructor(private readonly sourceMap: Data7SourceMap) {
    for (const segment of sourceMap.segments) {
      const key = SourceMapLookup.segmentKey(segment.generated.moduleName, segment.generated.line);
      this.byGeneratedLine.set(key, segment.original);
    }
    for (const symbol of sourceMap.symbols) {
      const lower = symbol.generatedName.toLowerCase();
      const bucket = this.symbolsByGeneratedLower.get(lower);
      if (bucket) {
        bucket.push(symbol);
      } else {
        this.symbolsByGeneratedLower.set(lower, [symbol]);
      }
    }
  }

  public static fromSourceMap(sourceMap: Data7SourceMap): SourceMapLookup {
    return new SourceMapLookup(sourceMap);
  }

  public static tryParse(json: unknown): SourceMapLookup | undefined {
    const parsed = parseData7SourceMap(json);
    return parsed ? SourceMapLookup.fromSourceMap(parsed) : undefined;
  }

  public get map(): Data7SourceMap {
    return this.sourceMap;
  }

  public findOriginal(moduleName: string, generatedLine: number): Data7SourcePosition | undefined {
    return this.byGeneratedLine.get(SourceMapLookup.segmentKey(moduleName, generatedLine));
  }

  /**
   * Resolve an uglified identifier back to its original declaration name.
   * When multiple symbols share the generated name, prefer an optional `fileUri` filter.
   */
  public findSymbolByGeneratedName(
    generatedName: string,
    options?: { readonly fileUri?: string },
  ): Data7SymbolMapping | undefined {
    const bucket = this.symbolsByGeneratedLower.get(generatedName.toLowerCase());
    if (!bucket || bucket.length === 0) return undefined;
    if (options?.fileUri) {
      const match = bucket.find((symbol) => symbol.fileUri === options.fileUri);
      if (match) return match;
    }
    return bucket[0];
  }

  private static segmentKey(moduleName: string, line: number): string {
    return `${moduleName.toLowerCase()}:${line}`;
  }
}
