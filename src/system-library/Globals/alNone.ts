import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "alNone",
    kind: "variable",
    type: "TAlign",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Sem alinhamento automático.",
  },
];
