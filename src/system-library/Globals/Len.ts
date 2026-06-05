import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Len",
    kind: "declare_function",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pString",
        type: "String",
        isByRef: false,
        isOptional: false,
      }
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Retorna o tamanho de uma string.",
  },
];
