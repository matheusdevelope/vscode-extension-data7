import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "SQL",
    kind: "namespace",
    type: "SQL",
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
      "Namespace contendo utilitários de acesso e execução de comandos SQL no banco de dados do ERP.",
  },
];
