export interface Data7SourcePosition {
  readonly fileUri: string;
  readonly line: number;
  readonly column: number;
}

export interface Data7GeneratedPosition {
  readonly moduleName: string;
  readonly line: number;
  readonly column: number;
}

export interface Data7MappingSegment {
  readonly generated: Data7GeneratedPosition;
  readonly original: Data7SourcePosition;
}

export interface Data7SymbolMapping {
  readonly originalName: string;
  readonly generatedName: string;
  readonly kind: string;
  readonly fileUri: string;
  readonly scope?: string;
}

export interface Data7SourceMap {
  readonly version: 1;
  readonly generatedProjectFile: string;
  readonly segments: readonly Data7MappingSegment[];
  readonly symbols: readonly Data7SymbolMapping[];
}
