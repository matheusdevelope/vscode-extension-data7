import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Data7",
    kind: "namespace",
    type: "Data7",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Namespace global contendo utilitários fornecidos pelo ERP Data7.",
  },
];
