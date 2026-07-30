export type {
  Data7GeneratedPosition,
  Data7MappingSegment,
  Data7SourceMap,
  Data7SourcePosition,
  Data7SymbolMapping,
} from "./data7-source-map";
export { Data7SourceMapBuilder } from "./source-map-builder";
export {
  composeLineMaps,
  identityLineMap,
  lineCountOf,
  shiftLineMapForInsert,
} from "./compose-line-maps";
export { writeData7SourceMapFiles } from "./write-source-map";
export { parseData7SourceMap, SourceMapLookup } from "./source-map-lookup";
export {
  resolveGeneratedPositionFromProjectXml,
  wordAtColumn,
  type GeneratedProjectCursorPosition,
} from "./resolve-generated-position";
export { loadSourceMapForProjectFile, type ResolveSourceMapFileOptions } from "./load-source-map";
