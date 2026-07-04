import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CodPeriodoCaixa",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description: "Retorna o código do período caixa atual.",
  },
];
