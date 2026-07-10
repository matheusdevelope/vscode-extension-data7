import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TProgressBarOrientation",
  containerName: "Forms",
  description: "Orientação de uma ProgressBar (ProgressBar.Orientation).",
  values: [
    ["pbHorizontal", "Barra horizontal (cresce da esquerda para a direita)."],
    ["pbVertical", "Barra vertical (cresce de baixo para cima)."],
  ],
});
