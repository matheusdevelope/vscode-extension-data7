import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ValorPorExtensoLinha2",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pValue",
        type: "Double",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pStart",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pEnd",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description:
      "Irá transformar um número em seu valor por extenso com possibilidade de informar o início e fim do caracter.",
  },
];
