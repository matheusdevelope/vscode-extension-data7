import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TButtonLayout",
  description:
    "Tipo de layout de um botão (TButton.Layout). Valores possíveis (declarados globalmente, sem necessidade de Imports): blGlyphLeft, blGlyphTop, blGlyphRight, blGlyphBottom, blGlyphCenter, blGlyphNone.",
  values: [
    ["blGlyphLeft", "Ícone à esquerda do texto."],
    ["blGlyphRight", "Ícone à direita do texto."],
    ["blGlyphTop", "Ícone acima do texto."],
    ["blGlyphBottom", "Ícone abaixo do texto."],
  ],
});
