import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ButtonOk",
    kind: "class",
    type: "ButtonOk",
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
    inheritsFrom: "TButtonControl",
    description:
      'Variante de CommandButton pré-configurada como botão de confirmação ("Ok"/"Confirmar") do diálogo.',
  },
];
