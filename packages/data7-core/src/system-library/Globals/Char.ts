import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Char",
    kind: "class",
    type: "Char",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    inheritsFrom: "String",
    fileUri: SYSTEM_URI,
    description: "Retorna o caractere correspondente ao código ASCII informado.",
  },
];
