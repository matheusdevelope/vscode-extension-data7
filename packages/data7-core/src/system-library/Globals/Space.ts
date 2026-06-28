import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Space",
    kind: "declare_function",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pSize",
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
    description: "Gera uma string contendo a quantidade de espaços em branco indicada.",
  },
];
