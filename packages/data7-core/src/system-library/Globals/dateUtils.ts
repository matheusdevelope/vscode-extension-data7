import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "dateUtils",
    kind: "class",
    type: "dateUtils",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Utilitários globais de data e hora compatíveis com Data7.",
  },
  {
    name: "toStringFormat",
    kind: "method",
    type: "String",
    isShared: true,
    isPrivate: false,
    parameters: [
      { name: "pFormat", type: "String", isByRef: false, isOptional: false },
      { name: "pDateTime", type: "TDateTime", isByRef: false, isOptional: false },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "dateUtils",
    description: "Formata uma data/hora usando o padrão informado.",
  },
];
