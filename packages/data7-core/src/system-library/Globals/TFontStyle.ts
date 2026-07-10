import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TFontStyle",
  description:
    "Estilo de fonte que pode ser combinado em um conjunto (set): TFontStyles = set of TFontStyle. Use em Font.Style para aplicar negrito, itálico, sublinhado e/ou tachado simultaneamente.",
  values: [
    ["fsBold", "Negrito."],
    ["fsItalic", "Itálico."],
    ["fsUnderline", "Sublinhado."],
    ["fsStrikeOut", "Tachado (riscado)."],
  ],
});
