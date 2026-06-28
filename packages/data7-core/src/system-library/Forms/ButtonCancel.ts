import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ButtonCancel",
    kind: "class",
    type: "ButtonCancel",
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
      'Variante de CommandButton pré-configurada como botão de cancelamento ("Cancelar") do diálogo.',
  },
];
