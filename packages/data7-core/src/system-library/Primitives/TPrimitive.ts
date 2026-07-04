import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPrimitive",
    kind: "class",
    type: "TPrimitive",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Tipo primitivo base para todos os tipos primitivos.",
  },
  {
    name: "ToString",
    kind: "method",
    type: "String",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TPrimitive",
    description: "Retorna a representação em texto do valor primitivo.",
  },
];
