import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBorderStyle",
  containerName: "Forms",
  description: "Tipo da propriedade BorderStyle de controles com moldura (Panel, Grid, edits).",
  values: [
    ["bsNone", "Sem borda visível."],
    ["bsSingle", "Borda simples visível."],
  ],
});
