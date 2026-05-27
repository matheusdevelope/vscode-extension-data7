import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBevelStyle",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBevelStyle",
    kind: "class",
    type: "TBevelStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Estilo visual de profundidade de uma Border (TBevel).",
  },

  bs("bsLowered", "Borda parece rebaixada (afundada na superfície)."),
  bs("bsRaised", "Borda parece elevada (saindo da superfície)."),
];
