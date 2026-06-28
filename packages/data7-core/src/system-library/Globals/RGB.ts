import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "RGB",
    kind: "declare_function",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pR",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pG",
        type: "Integer",
        isByRef: false,
        isOptional: false,
      },
      {
        name: "pB",
        type: "Integer",
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
    description: "Retorna a representação inteira de uma cor no padrão RGB.",
  },
];
