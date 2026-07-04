import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Criptografar",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pText",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description: "Criptografa uma string usando a chave criptográfica padrão do ERP.",
  },
];
