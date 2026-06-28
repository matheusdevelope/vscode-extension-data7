import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CInt",
    kind: "declare_function",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pValue",
        type: "Variant",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Converte um valor genérico para Integer.",
  },
];
