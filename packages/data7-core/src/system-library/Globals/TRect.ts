import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TRect",
  kind: "structure",
  description:
    "Retângulo definido por duas coordenadas (Left, Top) e (Right, Bottom). Estrutura padrão da VCL, acessível globalmente. Usado em BoundsRect, ClientRect, áreas de desenho do Canvas e funções de geometria.",
  properties: [
    { name: "Left", type: "Integer", description: "Coordenada X do canto superior esquerdo." },
    { name: "Top", type: "Integer", description: "Coordenada Y do canto superior esquerdo." },
    {
      name: "Right",
      type: "Integer",
      description: "Coordenada X do canto inferior direito (não inclusiva).",
    },
    {
      name: "Bottom",
      type: "Integer",
      description: "Coordenada Y do canto inferior direito (não inclusiva).",
    },
    { name: "Width", type: "Integer", description: "Largura calculada (Right - Left)." },
    { name: "Height", type: "Integer", description: "Altura calculada (Bottom - Top)." },
    { name: "TopLeft", type: "TPoint", description: "Canto superior esquerdo como TPoint." },
    { name: "BottomRight", type: "TPoint", description: "Canto inferior direito como TPoint." },
  ],
});
