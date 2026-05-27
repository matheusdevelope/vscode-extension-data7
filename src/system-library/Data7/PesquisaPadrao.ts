import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "PesquisaPadrao",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pNomeTabela",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pNomeCampo",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pNomeSchema",
        type: "String",
        isByRef: false,
        isOptional: true,
        defaultValue: '""',
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Data7",
    description: "Busca a pesquisa padrão vinculada ao campo da tabela informada.",
  },
];
