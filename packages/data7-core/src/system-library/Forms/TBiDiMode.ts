import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBiDiMode",
  containerName: "Forms",
  description:
    "Modo bidirecional do controle (suporte a idiomas Right-to-Left como Árabe e Hebraico). Usado em TControl.BiDiMode.",
  values: [
    ["bdLeftToRight", "Layout esquerda-para-direita (padrão para idiomas ocidentais)."],
    ["bdRightToLeft", "Layout direita-para-esquerda (inverte ordem de leitura e alinhamento)."],
    ["bdRightToLeftNoAlign", "Direita-para-esquerda mas mantém o alinhamento original."],
    [
      "bdRightToLeftReadingOnly",
      "Apenas a ordem de leitura é invertida; layout permanece esquerda-para-direita.",
    ],
  ],
});
