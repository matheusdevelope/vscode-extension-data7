import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "SQL",
    kind: "namespace",
    type: "SQL",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Namespace contendo utilitários de acesso e execução de comandos SQL no banco de dados do ERP.",
  },
];
