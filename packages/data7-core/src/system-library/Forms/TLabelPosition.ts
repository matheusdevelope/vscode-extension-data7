import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TLabelPosition",
  containerName: "Forms",
  description:
    "Posição do rótulo (TBoundLabel) em relação ao controle de edição associado. Usado em TLabeledEdit.LabelPosition.",
  values: [
    ["lpAbove", "Rótulo acima do edit."],
    ["lpBelow", "Rótulo abaixo do edit."],
    ["lpLeft", "Rótulo à esquerda do edit."],
    ["lpRight", "Rótulo à direita do edit."],
  ],
});
