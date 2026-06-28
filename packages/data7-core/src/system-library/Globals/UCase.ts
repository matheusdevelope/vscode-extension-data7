import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "UCase",
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
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Converte todos os caracteres da string para maiúsculas.",
  },
];
