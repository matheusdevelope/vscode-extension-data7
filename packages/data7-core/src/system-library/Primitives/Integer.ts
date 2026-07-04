import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Integer",
    kind: "class",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    inheritsFrom: "TPrimitive",
    fileUri: SYSTEM_URI,
    description: "Tipo primitivo de número inteiro de 32 bits.",
  },
  {
    name: "ToDouble",
    kind: "method",
    type: "Double",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Integer",
    description: "Converte o valor inteiro para Double.",
  },
];
