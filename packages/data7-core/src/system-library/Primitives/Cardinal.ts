import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Cardinal",
    kind: "class",
    type: "Cardinal",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    inheritsFrom: "Integer",
    fileUri: SYSTEM_URI,
    description: "Tipo primitivo de número inteiro de 32 bits.",
  },
];
