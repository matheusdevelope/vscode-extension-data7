import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Base64ToFile",
    kind: "declare_function",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pBase64Str",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pDestPath",
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
    description: "Converte uma string codificada em Base64 de volta para o arquivo original.",
  },
];
