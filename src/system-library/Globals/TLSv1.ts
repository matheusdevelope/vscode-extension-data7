import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TLSv1",
    kind: "variable",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Versão do SSL/TLS: TLS v1.0.",
  },
];
