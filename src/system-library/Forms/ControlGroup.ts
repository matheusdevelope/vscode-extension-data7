import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ControlGroup",
    kind: "class",
    type: "ControlGroup",
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
    inheritsFrom: "TGraphicControl",
    description:
      "Agrupador visual de controles desenhado via Canvas (sem janela própria). Equivalente ao TControlGroup do Data7.",
  },
];
