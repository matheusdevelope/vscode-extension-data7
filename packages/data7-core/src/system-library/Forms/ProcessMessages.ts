import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ProcessMessages",
    kind: "method",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Força a thread principal do ERP a processar mensagens pendentes da fila do Windows (evita congelamento da tela).",
  },
];
