import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "NomeArquivoExecutavel",
    kind: "variable",
    type: "String",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Data7",
    description:
      "Retorna o nome do executável atualmente rodando o plugin (ex: DEVSTUDIO.EXE ou EXECUTOR.EXE).",
  },
];
