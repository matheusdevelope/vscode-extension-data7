import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "DateTime",
    kind: "declare_function",
    type: "TDateTime",
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
    description: "Retorna um objeto TDateTime inicializado com a data e hora atuais do computador.",
  },
];
