import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Clipboard",
    kind: "class",
    type: "Clipboard",
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
    description: "Classe nativa do sistema para manipulação da área de transferência (Clipboard).",
  },
  {
    name: "GetText",
    kind: "method",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Clipboard",
    description: "Retorna o texto da área de transferência.",
  },
  {
    name: "SetText",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      {
        name: "pValue",
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
    containerName: "Clipboard",
    description: "Define o texto na área de transferência.",
  },
];
