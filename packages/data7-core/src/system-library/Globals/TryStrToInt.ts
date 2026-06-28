import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TryStrToInt",
    kind: "declare_function",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pStr",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pValue",
        type: "Integer",
        isByRef: true,
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
    description: "Tenta converter uma string em um inteiro. Retorna True se obtiver sucesso.",
  },
];
