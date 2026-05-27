import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const ps = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TPenStyle",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Drawing",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPenStyle",
    kind: "class",
    type: "TPenStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Drawing",
    description: "Estilo de traço de uma TPen. Usado em Canvas.Pen.Style e TShape.Pen.Style.",
  },

  ps("psSolid", "Linha contínua (sólida)."),
  ps("psDash", "Linha tracejada (—  —  —)."),
  ps("psDot", "Linha pontilhada (· · ·)."),
  ps("psDashDot", "Linha traço-ponto (— · — ·)."),
  ps("psDashDotDot", "Linha traço-ponto-ponto (— · · — · ·)."),
  ps("psClear", "Sem linha (invisível)."),
  ps("psInsideFrame", "Linha dentro do contorno da forma (somente com largura > 1)."),
  ps("psUserStyle", "Estilo customizado definido pelo usuário (combinações de dashes)."),
  ps("psAlternate", "Pixels alternados (mais fino que psDot)."),
];
