import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ValorPorExtensoLinha1",
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
      {
        name: "pStart",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pEnd",
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
    containerName: "Data7",
    description:
      "Irá transformar um número em seu valor por extenso com possibilidade de informar o início e fim do caracter.",
  },
];
