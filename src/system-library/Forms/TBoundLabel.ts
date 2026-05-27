import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBoundLabel",
    kind: "class",
    type: "TBoundLabel",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TWinControl",
    description: "Rótulo associado a um controle de edição (TLabeledEdit).",
  },
  {
    name: "Caption",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "TBoundLabel",
    description: "Texto exibido no rótulo.",
  },
];
