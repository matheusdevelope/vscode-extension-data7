import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Execute",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pFileName",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pParameter",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pWaitForEnd",
        type: "Boolean",
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
    containerName: "Environment",
    description: "Executa um arquivo no windows, simula um clique duplo do mouse.",
  },
];
