import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const ps = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TPenStyle",
  isShared: true,
  isPrivate: false,
  range: SYSTEM_RANGE,
  fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
