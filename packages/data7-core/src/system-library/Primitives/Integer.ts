import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Integer",
    kind: "class",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    inheritsFrom: "TPrimitive",
    fileUri: "system://library",
    description: "Tipo primitivo de número inteiro de 32 bits.",
  },
  {
    name: "ToDouble",
    kind: "method",
    type: "Double",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Integer",
    description: "Converte o valor inteiro para Double.",
  },
];
