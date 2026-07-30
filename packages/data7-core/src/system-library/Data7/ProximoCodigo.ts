import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ProximoCodigo",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pNomeSequencia",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pCodEmpresa",
        type: "Integer",
        isByRef: false,
        isOptional: true,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description: "Retorna o próximo código do sequenciador informado.",
  },
];
