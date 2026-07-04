import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "PasswordTextBox",
    kind: "class",
    type: "PasswordTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Variante de TextBox configurada para entrada de senhas (caracteres mascarados).",
  },
];
