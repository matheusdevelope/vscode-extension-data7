import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = buildClassSymbols({
  className: "TPoint",
  kind: "structure",
  description:
    "Ponto em coordenadas (X, Y) na superfície de desenho ou tela. Estrutura padrão da VCL, acessível globalmente. Usado por eventos de mouse, conversões de coordenadas (ClientToScreen/ScreenToClient) e funções gráficas.",
  properties: [
    { name: "X", type: "Integer", description: "Coordenada horizontal (X) em pixels." },
    { name: "Y", type: "Integer", description: "Coordenada vertical (Y) em pixels." },
  ],
});
