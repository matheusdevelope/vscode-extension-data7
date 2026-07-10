import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TFontPitch",
  description: "Enumeração para definir o pitch da fonte.",
  values: [
    ["fpDefault", "Use o pitch padrão da fonte."],
    ["fpFixed", "Use um pitch fixo."],
    ["fpVariable", "Use um pitch variável."],
  ],
});
