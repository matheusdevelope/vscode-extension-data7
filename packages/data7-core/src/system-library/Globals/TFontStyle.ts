import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const fs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TFontStyle",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFontStyle",
    kind: "class",
    type: "TFontStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Estilo de fonte que pode ser combinado em um conjunto (set): TFontStyles = set of TFontStyle. Use em Font.Style para aplicar negrito, itálico, sublinhado e/ou tachado simultaneamente.",
  },

  fs("fsBold", "Negrito."),
  fs("fsItalic", "Itálico."),
  fs("fsUnderline", "Sublinhado."),
  fs("fsStrikeOut", "Tachado (riscado)."),
];
