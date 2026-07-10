import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "FlatButton",
  namespaceContainer: "Forms",
  inheritsFrom: "TGraphicControl",
  description:
    "Botão visual chato (flat) baseado em TSpeedButton — renderizado pelo Canvas do pai, sem janela própria. Ideal para barras de ferramentas.",
  properties: [
    { name: "Caption", type: "String", description: "Texto exibido no botão." },
    { name: "Text", type: "String", description: "Texto exibido no botão." },
    { name: "Transparent", type: "Boolean", description: "Determina se o botão é transparente." },
    { name: "Image", type: "Variant", description: "Imagem exibida no botão." },
    {
      name: "Glyph",
      type: "Variant",
      description:
        "Imagem (bitmap) exibida no botão. Pode conter até 4 estados (normal, disabled, clicked, down).",
    },
    {
      name: "NumGlyphs",
      type: "Integer",
      description: "Quantidade de imagens contidas em Glyph (1 a 4).",
    },
    {
      name: "Flat",
      type: "Boolean",
      description: "Se o botão é renderizado em estilo flat (sem borda 3D destacada).",
    },
    {
      name: "GroupIndex",
      type: "Integer",
      description:
        "Identifica o grupo de botões mutualmente exclusivos (radio behavior). 0 = sem grupo.",
    },
    {
      name: "Down",
      type: "Boolean",
      description: "Estado pressionado do botão (quando GroupIndex > 0).",
    },
    {
      name: "AllowAllUp",
      type: "Boolean",
      description: "Se todos os botões do grupo podem estar simultaneamente desativados.",
    },
    {
      name: "Layout",
      type: "Integer",
      description:
        "Posição do glyph em relação ao caption (blGlyphLeft, blGlyphRight, blGlyphTop, blGlyphBottom).",
    },
    { name: "Spacing", type: "Integer", description: "Espaçamento entre o glyph e o caption." },
    { name: "OnClick", type: "TNotifyEvent", description: "Ocorre quando o botão é clicado." },
  ],
});
