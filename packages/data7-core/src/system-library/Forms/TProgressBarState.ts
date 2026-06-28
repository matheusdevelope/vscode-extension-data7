import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const pbs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TProgressBarState",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TProgressBarState",
    kind: "class",
    type: "TProgressBarState",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Estado visual de uma ProgressBar (ProgressBar.State) — afeta a cor da barra preenchida.",
  },

  pbs("pbsNormal", "Estado normal — barra verde."),
  pbs("pbsError", "Estado de erro — barra vermelha."),
  pbs("pbsPaused", "Estado pausado — barra amarela."),
];
