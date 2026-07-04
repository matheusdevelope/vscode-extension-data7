import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "NomeArquivoExecutavel",
    kind: "variable",
    type: "String",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Data7",
    description:
      "Retorna o nome do executável atualmente rodando o plugin (ex: DEVSTUDIO.EXE ou EXECUTOR.EXE).",
  },
];
