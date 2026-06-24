import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Math",
    kind: "class",
    type: "Math",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    inheritsFrom: "TObject",
    description: "Classe utilitária para funções matemáticas do sistema.",
  },
  {
    name: "Truncate",
    kind: "method",
    type: "Double",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pValor",
        type: "Double",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pDecimals",
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
    containerName: "Math",
    description:
      "Trunca um valor de ponto flutuante para a quantidade de casas decimais especificada.",
  },
];
