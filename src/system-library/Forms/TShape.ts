import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TShape",
    kind: "class",
    type: "TShape",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TGraphicControl",
    description:
      "Base para os componentes de formas geométricas desenhadas (Rectangle, Ellipse, Line). Expõe propriedades de Pen e Brush para customização visual.",
  },

  // ───────── Properties ─────────
  {
    name: "Brush",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TShape",
    description: "Cor e padrão usados para preencher a forma.",
  },
  {
    name: "Pen",
    kind: "property",
    type: "TPen",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TShape",
    description: "Caneta usada para desenhar o contorno da forma.",
  },
  {
    name: "Shape",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TShape",
    description:
      "Tipo da forma desenhada (stRectangle, stSquare, stRoundRect, stCircle, stEllipse, etc.).",
  },
];
