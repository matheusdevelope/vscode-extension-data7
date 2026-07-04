import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ProcessMessages",
    kind: "method",
    type: "Void",
    isShared: true,
    isPrivate: false,
    parameters: [],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Força a thread principal do ERP a processar mensagens pendentes da fila do Windows (evita congelamento da tela).",
  },
];
