import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ProximoCodigo",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pNomeSequenciador",
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
    description: "Retorna o próximo código do sequenciador informado.",
  },
];
