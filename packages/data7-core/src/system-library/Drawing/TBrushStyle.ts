import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBrushStyle",
  containerName: "Drawing",
  description:
    "Padrão de preenchimento de uma TBrush (cor sólida ou hachura). Usado em Canvas.Brush.Style e TShape.Brush.Style.",
  values: [
    ["bsSolid", "Preenchimento sólido com Brush.Color."],
    ["bsClear", "Sem preenchimento (transparente)."],
    ["bsHorizontal", "Hachura horizontal."],
    ["bsVertical", "Hachura vertical."],
    ["bsFDiagonal", "Hachura diagonal (forward — sobe da esquerda para a direita)."],
    ["bsBDiagonal", "Hachura diagonal (back — desce da esquerda para a direita)."],
    ["bsCross", "Hachura em cruz (horizontal + vertical)."],
    ["bsDiagCross", "Hachura em xis (diagonal cross)."],
  ],
});
