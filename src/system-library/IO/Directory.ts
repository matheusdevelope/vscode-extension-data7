import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Directory",
    kind: "class",
    type: "IO.Directory",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "IO",
    description: "Classe para manipulação e seleção de diretórios.",
  },
  {
    name: "SelectDialog",
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
    containerName: "Directory",
    description:
      "Exibe uma caixa de diálogo para seleção de um diretório e retorna o caminho do diretório selecionado.",
  },
  {
    name: "Create",
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
    containerName: "Directory",
    description: "Cria um diretório. Retorna true sempre que o diretório for criado com sucesso.",
  },
  {
    name: "Exists",
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
    containerName: "Directory",
    description: "Verifica se o diretório existe.",
  },
];
