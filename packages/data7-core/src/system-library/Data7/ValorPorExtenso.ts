import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ValorPorExtenso",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pValue",
        type: "Double",
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
    description: "Irá transformar um número em seu valor por extenso.",
  },
];
