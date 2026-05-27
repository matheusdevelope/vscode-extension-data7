import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const pb = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TProgressBarOrientation",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TProgressBarOrientation",
    kind: "class",
    type: "TProgressBarOrientation",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Orientação de uma ProgressBar (ProgressBar.Orientation).",
  },

  pb("pbHorizontal", "Barra horizontal (cresce da esquerda para a direita)."),
  pb("pbVertical", "Barra vertical (cresce de baixo para cima)."),
];
