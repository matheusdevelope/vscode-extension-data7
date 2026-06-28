import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Drawing",
    kind: "namespace",
    type: "Drawing",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    description:
      "Namespace nativo do Data7 para recursos gráficos e de desenho (TCanvas, TPen, etc.).",
  },
];
