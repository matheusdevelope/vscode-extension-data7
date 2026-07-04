import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description: "Busca a pesquisa padrão vinculada ao campo da tabela informada.",
  },
];
