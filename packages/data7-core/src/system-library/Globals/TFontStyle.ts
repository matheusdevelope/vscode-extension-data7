import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFontStyle",
    kind: "class",
    type: "TFontStyle",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Estilo de fonte que pode ser combinado em um conjunto (set): TFontStyles = set of TFontStyle. Use em Font.Style para aplicar negrito, itálico, sublinhado e/ou tachado simultaneamente.",
  },

  buildEnumVal("fsBold", "TFontStyle", "Negrito."),
  buildEnumVal("fsItalic", "TFontStyle", "Itálico."),
  buildEnumVal("fsUnderline", "TFontStyle", "Sublinhado."),
  buildEnumVal("fsStrikeOut", "TFontStyle", "Tachado (riscado)."),
];
