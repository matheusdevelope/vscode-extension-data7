import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, param } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TFont",
  description: "Fonte usada por controles e elementos visuais. Expõe nome, tamanho, estilo e cor.",
  properties: [
    { name: "Name", type: "String", description: "Nome da fonte." },
    { name: "Size", type: "Integer", description: "Tamanho da fonte em pontos." },
    { name: "Height", type: "Integer", description: "Altura da fonte em pixels lógicos." },
    { name: "Color", type: "Integer", description: "Cor do texto renderizado com a fonte." },
    {
      name: "Style",
      type: "TFontStyle",
      description: "Estilo da fonte (bold, italic, underline, strikeout).",
    },
    { name: "Bold", type: "Boolean", description: "Define se a fonte está em negrito." },
    { name: "Italic", type: "Boolean", description: "Define se a fonte está em itálico." },
    { name: "Underline", type: "Boolean", description: "Define se a fonte está sublinhada." },
    { name: "StrikeOut", type: "Boolean", description: "Define se a fonte está riscada." },
    { name: "Orientation", type: "Integer", description: "Orientação da fonte em graus." },
    { name: "Charset", type: "Integer", description: "Charset da fonte." },
    { name: "Pitch", type: "TFontPitch", description: "Pitch da fonte." },
    { name: "Quality", type: "TFontQuality", description: "Quality da fonte." },
  ],
  methods: [
    {
      name: "GetBold",
      returns: "Boolean",
      params: [],
      description: "Retorna se a fonte está em negrito.",
    },
    {
      name: "GetItalic",
      returns: "Boolean",
      params: [],
      description: "Retorna se a fonte está em itálico.",
    },
    {
      name: "GetUnderline",
      returns: "Boolean",
      params: [],
      description: "Retorna se a fonte está sublinhada.",
    },
    {
      name: "GetStrikeOut",
      returns: "Boolean",
      params: [],
      description: "Retorna se a fonte está riscada.",
    },
    {
      name: "SetBold",
      returns: "Void",
      params: [param("pValue", "Boolean")],
      description: "Define se a fonte está em negrito.",
    },
    {
      name: "SetItalic",
      returns: "Void",
      params: [param("pValue", "Boolean")],
      description: "Define se a fonte está em itálico.",
    },
    {
      name: "SetUnderline",
      returns: "Void",
      params: [param("pValue", "Boolean")],
      description: "Define se a fonte está sublinhada.",
    },
    {
      name: "SetStrikeOut",
      returns: "Void",
      params: [param("pValue", "Boolean")],
      description: "Define se a fonte está riscada.",
    },
  ],
});
