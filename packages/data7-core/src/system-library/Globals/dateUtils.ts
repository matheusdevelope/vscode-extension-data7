import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "dateUtils",
    kind: "class",
    type: "dateUtils",
    isShared: true,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
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
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "dateUtils",
    description: "Formata uma data/hora usando o padrão informado.",
  },
];
