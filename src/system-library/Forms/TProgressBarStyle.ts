import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const pbst = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TProgressBarStyle",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TProgressBarStyle",
    kind: "class",
    type: "TProgressBarStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Estilo de uma ProgressBar (ProgressBar.Style).",
  },

  pbst("pbstNormal", "Barra padrão — exibe Position entre Min e Max."),
  pbst(
    "pbstMarquee",
    'Animação contínua ("marquee") — usa quando o tempo de operação é indeterminado.',
  ),
];
