import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "PasswordTextBox",
    kind: "class",
    type: "PasswordTextBox",
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
    description: "Variante de TextBox configurada para entrada de senhas (caracteres mascarados).",
  },
];
