import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "NumberTextBox",
    kind: "class",
    type: "NumberTextBox",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Caixa de texto especializada em entrada numérica com calculadora popup (TNumeroEditor). Wrapper sobre TcxCalcEdit.",
  },
];
