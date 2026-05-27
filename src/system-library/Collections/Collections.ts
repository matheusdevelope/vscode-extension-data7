import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Collections",
    kind: "namespace",
    type: "Collections",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description:
      "Namespace nativo do Data7 para estruturas de dados e coleções (StringList, etc.).",
  },
];
