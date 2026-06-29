import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Cardinal",
    kind: "class",
    type: "Cardinal",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    inheritsFrom: "Integer",
    fileUri: "system://library",
    description: "Tipo primitivo de número inteiro de 32 bits.",
  },
];
