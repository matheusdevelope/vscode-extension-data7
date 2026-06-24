import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MilliSecondOf",
    kind: "method",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range,
    fileUri: "system://library",
    containerName: "TDateTime",
    description: "Alias de compatibilidade para acessar os milissegundos com chamada de metodo.",
  },
];
