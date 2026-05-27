import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Line",
    kind: "class",
    type: "Line",
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
    inheritsFrom: "TShape",
    description: "Linha geométrica (horizontal, vertical ou diagonal) desenhada como TShape.",
  },
];
