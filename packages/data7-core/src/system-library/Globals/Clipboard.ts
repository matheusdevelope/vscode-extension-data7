import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Clipboard",
    kind: "class",
    type: "Clipboard",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    inheritsFrom: "TObject",
    description: "Classe nativa do sistema para manipulação da área de transferência (Clipboard).",
  },
  {
    name: "GetText",
    kind: "method",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Clipboard",
    description: "Define o texto na área de transferência.",
  },
];
