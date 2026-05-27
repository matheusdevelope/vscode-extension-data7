import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Left",
    kind: "declare_function",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pString",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pLength",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Retorna a quantidade especificada de caracteres a partir da esquerda da string.",
  },
];
