import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBevelStyle",
  containerName: "Forms",
  description: "Estilo visual de profundidade de uma Border (TBevel).",
  values: [
    ["bsLowered", "Borda parece rebaixada (afundada na superfície)."],
    ["bsRaised", "Borda parece elevada (saindo da superfície)."],
  ],
});
