import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPersistent",
    kind: "class",
    type: "TPersistent",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "System.Classes.TPersistent",
    description: "Retorna o nome do objeto como aparece no Inspetor de Objetos.",
  },
];
