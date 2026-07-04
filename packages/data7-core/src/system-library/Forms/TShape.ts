import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TShape",
    kind: "class",
    type: "TShape",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TShape",
    description: "Cor e padrão usados para preencher a forma.",
  },
  {
    name: "Pen",
    kind: "property",
    type: "TPen",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TShape",
    description: "Caneta usada para desenhar o contorno da forma.",
  },
  {
    name: "Shape",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TShape",
    description:
      "Tipo da forma desenhada (stRectangle, stSquare, stRoundRect, stCircle, stEllipse, etc.).",
  },
];
