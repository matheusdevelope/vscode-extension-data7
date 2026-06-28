import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Parametro",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pNomeParametro",
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
    containerName: "Data7",
    description: "Retorna o valor fixo do parâmetro informado.",
  },
];
