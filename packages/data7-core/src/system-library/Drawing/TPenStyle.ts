import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TPenStyle",
  containerName: "Drawing",
  description: "Estilo de traço de uma TPen. Usado em Canvas.Pen.Style e TShape.Pen.Style.",
  values: [
    ["psSolid", "Linha contínua (sólida)."],
    ["psDash", "Linha tracejada (—  —  —)."],
    ["psDot", "Linha pontilhada (· · ·)."],
    ["psDashDot", "Linha traço-ponto (— · — ·)."],
    ["psDashDotDot", "Linha traço-ponto-ponto (— · · — · ·)."],
    ["psClear", "Sem linha (invisível)."],
    ["psInsideFrame", "Linha dentro do contorno da forma (somente com largura > 1)."],
    ["psUserStyle", "Estilo customizado definido pelo usuário (combinações de dashes)."],
    ["psAlternate", "Pixels alternados (mais fino que psDot)."],
  ],
});
