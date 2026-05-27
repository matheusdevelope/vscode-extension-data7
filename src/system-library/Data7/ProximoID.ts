import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ProximoID",
    kind: "method",
    type: "String",
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
    containerName: "Data7",
    description: "Retorna o próximo ID geral. Sequenciador: Geral.GeralID",
  },
];
