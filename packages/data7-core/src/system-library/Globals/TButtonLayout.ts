import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TButtonLayout",
    kind: "class",
    type: "TButtonLayout",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Tipo de layout de um botão (TButton.Layout). Valores possíveis (declarados globalmente, sem necessidade de Imports): blGlyphLeft, blGlyphTop, blGlyphRight, blGlyphBottom, blGlyphCenter, blGlyphNone.",
  },
  buildEnumVal("blGlyphLeft", "TButtonLayout", "Ícone à esquerda do texto."),
  buildEnumVal("blGlyphRight", "TButtonLayout", "Ícone à direita do texto."),
  buildEnumVal("blGlyphTop", "TButtonLayout", "Ícone acima do texto."),
  buildEnumVal("blGlyphBottom", "TButtonLayout", "Ícone abaixo do texto."),
];
