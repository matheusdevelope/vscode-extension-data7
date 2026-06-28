import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPoint",
    kind: "structure",
    type: "TPoint",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Ponto em coordenadas (X, Y) na superfície de desenho ou tela. Estrutura padrão da VCL, acessível globalmente. Usado por eventos de mouse, conversões de coordenadas (ClientToScreen/ScreenToClient) e funções gráficas.",
  },

  {
    name: "X",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TPoint",
    description: "Coordenada horizontal (X) em pixels.",
  },
  {
    name: "Y",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "TPoint",
    description: "Coordenada vertical (Y) em pixels.",
  },
];
