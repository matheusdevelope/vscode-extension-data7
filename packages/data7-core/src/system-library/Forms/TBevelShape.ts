import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBevelShape",
  containerName: "Forms",
  description:
    "Forma de uma Border (TBevel). Define se o bevel é um retângulo cheio, uma linha simples ou apenas um espaçador.",
  values: [
    ["bsBox", "Caixa retangular preenchida (4 lados)."],
    ["bsFrame", "Moldura retangular (4 lados, sem preenchimento)."],
    ["bsTopLine", "Apenas uma linha no topo."],
    ["bsBottomLine", "Apenas uma linha na base."],
    ["bsLeftLine", "Apenas uma linha à esquerda."],
    ["bsRightLine", "Apenas uma linha à direita."],
    ["bsSpacer", "Espaçador invisível (não desenha nada, ocupa apenas espaço)."],
  ],
});
