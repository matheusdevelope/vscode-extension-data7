import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "dbPostgreSQL",
    kind: "variable",
    type: "TRDBMS",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description: "Tipo do RDBMS conectado (PostgreSQL).",
  },
];
