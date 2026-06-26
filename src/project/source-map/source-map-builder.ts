import type { Data7MappingSegment, Data7SourceMap, Data7SymbolMapping } from "./data7-source-map";

export class Data7SourceMapBuilder {
  private readonly segments: Data7MappingSegment[] = [];
  private readonly symbols: Data7SymbolMapping[] = [];

  public addLineMappings(
    moduleName: string,
    generatedCode: string,
    sourceFileUri: string,
    lineMap: readonly number[] | undefined,
  ): void {
    if (!lineMap) return;
    const lines = generatedCode.split(/\r?\n/);
    for (let generatedLine = 0; generatedLine < lines.length; generatedLine++) {
      const originalLine = lineMap[generatedLine];
      if (originalLine === undefined || originalLine < 0) continue;
      this.segments.push({
        generated: { moduleName, line: generatedLine, column: 0 },
        original: { fileUri: sourceFileUri, line: originalLine, column: 0 },
      });
    }
  }

  public addSymbol(mapping: Data7SymbolMapping): void {
    this.symbols.push(mapping);
  }

  public build(generatedProjectFile: string): Data7SourceMap {
    return {
      version: 1,
      generatedProjectFile,
      segments: [...this.segments],
      symbols: [...this.symbols],
    };
  }
}
