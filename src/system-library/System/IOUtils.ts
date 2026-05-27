import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "IOUtils",
    kind: "class",
    type: "IOUtils",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "System",
    description: "Utilitários para manipulação do sistema de arquivos.",
  },
  {
    name: "FileExists",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
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
    containerName: "IOUtils",
    description: "Verifica se o arquivo especificado existe no disco.",
  },
  {
    name: "DirectoryExists",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pPath",
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
    containerName: "IOUtils",
    description: "Verifica se o diretório especificado existe no disco.",
  },
];
