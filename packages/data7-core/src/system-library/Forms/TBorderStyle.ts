import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBorderStyle",
    kind: "class",
    type: "TBorderStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Tipo da propriedade BorderStyle de controles com moldura (Panel, Grid, edits).",
  },
  {
    name: "bsNone",
    kind: "variable",
    type: "TBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Sem borda visível.",
  },
  {
    name: "bsSingle",
    kind: "variable",
    type: "TBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Borda simples visível.",
  },
];
