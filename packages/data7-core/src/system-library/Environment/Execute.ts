import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Execute",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pFileName",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pParameter",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pWaitForEnd",
        type: "Boolean",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Environment",
    description: "Executa um arquivo no windows, simula um clique duplo do mouse.",
  },
];
