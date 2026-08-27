import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, param } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TBrush",
  description: "Pincel usado para preencher áreas de desenho.",
  properties: [
    { name: "Color", type: "Integer", description: "Cor do pincel." },
    { name: "Style", type: "TBrushStyle", description: "Estilo do pincel." },
    { name: "OnChange", type: "TNotifyEvent", description: "Evento de mudança do pincel." },
  ]
});
