import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TProgressBarState",
  containerName: "Forms",
  description:
    "Estado visual de uma ProgressBar (ProgressBar.State) — afeta a cor da barra preenchida.",
  values: [
    ["pbsNormal", "Estado normal — barra verde."],
    ["pbsError", "Estado de erro — barra vermelha."],
    ["pbsPaused", "Estado pausado — barra amarela."],
  ],
});
