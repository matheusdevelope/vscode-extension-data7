import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "FileToBase64",
    kind: "declare_function",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pFileName",
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
    description: "Lê o arquivo especificado e retorna seu conteúdo codificado em Base64.",
  },
];
