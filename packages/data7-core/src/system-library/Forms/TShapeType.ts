import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const st = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TShapeType",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TShapeType",
    kind: "class",
    type: "TShapeType",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Forma geométrica desenhada por TShape (Rectangle, Ellipse, Line). Usado em TShape.Shape.",
  },

  st("stRectangle", "Retângulo."),
  st("stSquare", "Quadrado (mantém proporção 1:1)."),
  st("stRoundRect", "Retângulo com cantos arredondados."),
  st("stRoundSquare", "Quadrado com cantos arredondados."),
  st("stEllipse", "Elipse."),
  st("stCircle", "Círculo (mantém proporção 1:1)."),
];
