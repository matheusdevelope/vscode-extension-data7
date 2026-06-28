import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Print",
    kind: "method",
    type: "void",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "Msg",
        type: "String",
        isOptional: false,
        isByRef: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Imprime uma mensagem no console do executor.",
  },
];
