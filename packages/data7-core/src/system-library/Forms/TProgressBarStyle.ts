import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TProgressBarStyle",
  containerName: "Forms",
  description: "Estilo de uma ProgressBar (ProgressBar.Style).",
  values: [
    ["pbstNormal", "Barra padrão — exibe Position entre Min e Max."],
    [
      "pbstMarquee",
      'Animação contínua ("marquee") — usa quando o tempo de operação é indeterminado.',
    ],
  ],
});
