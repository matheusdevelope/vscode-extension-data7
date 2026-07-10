import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TAlignment",
  description:
    "Alinhamento horizontal do texto/conteúdo. Valores possíveis (declarados globalmente, sem necessidade de Imports): taLeftJustify, taRightJustify, taCenter.",
  values: [
    ["taLeftJustify", "Texto alinhado à esquerda."],
    ["taRightJustify", "Texto alinhado à direita."],
    ["taCenter", "Texto centralizado."],
  ],
});
