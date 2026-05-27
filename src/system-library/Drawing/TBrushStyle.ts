import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBrushStyle",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Drawing",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBrushStyle",
    kind: "class",
    type: "TBrushStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Drawing",
    description:
      "Padrão de preenchimento de uma TBrush (cor sólida ou hachura). Usado em Canvas.Brush.Style e TShape.Brush.Style.",
  },

  bs("bsSolid", "Preenchimento sólido com Brush.Color."),
  bs("bsClear", "Sem preenchimento (transparente)."),
  bs("bsHorizontal", "Hachura horizontal."),
  bs("bsVertical", "Hachura vertical."),
  bs("bsFDiagonal", "Hachura diagonal (forward — sobe da esquerda para a direita)."),
  bs("bsBDiagonal", "Hachura diagonal (back — desce da esquerda para a direita)."),
  bs("bsCross", "Hachura em cruz (horizontal + vertical)."),
  bs("bsDiagCross", "Hachura em xis (diagonal cross)."),
];
