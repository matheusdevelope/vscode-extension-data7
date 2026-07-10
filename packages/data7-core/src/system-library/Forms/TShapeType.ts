import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TShapeType",
  containerName: "Forms",
  description:
    "Forma geométrica desenhada por TShape (Rectangle, Ellipse, Line). Usado em TShape.Shape.",
  values: [
    ["stRectangle", "Retângulo."],
    ["stSquare", "Quadrado (mantém proporção 1:1)."],
    ["stRoundRect", "Retângulo com cantos arredondados."],
    ["stRoundSquare", "Quadrado com cantos arredondados."],
    ["stEllipse", "Elipse."],
    ["stCircle", "Círculo (mantém proporção 1:1)."],
  ],
});
