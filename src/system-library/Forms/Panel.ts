import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Panel",
    kind: "class",
    type: "Panel",
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
    inheritsFrom: "TCustomControl",
    description:
      "Container retangular genérico para agrupar e posicionar outros controles. Wrapper sobre TCustomPanel da VCL.",
  },
];
