import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Timer",
    kind: "declare_function",
    type: "Double",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Retorna o número de segundos transcorridos desde a meia-noite.",
  },
];
