import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPersistent",
    kind: "class",
    type: "TPersistent",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "System.Classes",
    inheritsFrom: "System.Classes.TObject",
    description:
      "Classe ancestral para todos os objetos nativos Delphi que suportam atribuição e persistência em streams.",
  },
  {
    name: "Assign",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      {
        name: "pSource",
        type: "TObject",
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
    containerName: "System.Classes.TPersistent",
    description: "Copia o conteúdo de outro objeto compatível para esta instância.",
  },
  {
    name: "GetNamePath",
    kind: "method",
    type: "String",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "System.Classes.TPersistent",
    description: "Retorna o nome do objeto como aparece no Inspetor de Objetos.",
  },
];
