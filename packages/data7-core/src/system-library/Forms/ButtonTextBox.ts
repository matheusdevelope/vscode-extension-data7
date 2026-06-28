import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ButtonTextBox",
    kind: "class",
    type: "ButtonTextBox",
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
      "Caixa de texto com botão de ação lateral configurável (TEditorBotao). Wrapper sobre TcxButtonEdit.",
  },
];
