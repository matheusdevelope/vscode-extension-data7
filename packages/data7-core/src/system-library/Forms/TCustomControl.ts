import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCustomControl",
    kind: "class",
    type: "TCustomControl",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TWinControl",
    description:
      "Variante de TWinControl que combina janela nativa do Windows com superfície de desenho via Canvas. Base de controles complexos customizados (Panel, Grid, controles cx*).",
  },

  // ───────── Properties ─────────
  {
    name: "Canvas",
    kind: "property",
    type: "TCanvas",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TCustomControl",
    description: "Superfície de desenho do controle, expondo a API Canvas para pintar diretamente.",
  },
];
