import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCustomControl",
    kind: "class",
    type: "TCustomControl",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TCustomControl",
    description: "Superfície de desenho do controle, expondo a API Canvas para pintar diretamente.",
  },
];
