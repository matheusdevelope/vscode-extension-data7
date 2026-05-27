import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bd = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBiDiMode",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBiDiMode",
    kind: "class",
    type: "TBiDiMode",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Modo bidirecional do controle (suporte a idiomas Right-to-Left como Árabe e Hebraico). Usado em TControl.BiDiMode.",
  },

  bd("bdLeftToRight", "Layout esquerda-para-direita (padrão para idiomas ocidentais)."),
  bd("bdRightToLeft", "Layout direita-para-esquerda (inverte ordem de leitura e alinhamento)."),
  bd("bdRightToLeftNoAlign", "Direita-para-esquerda mas mantém o alinhamento original."),
  bd(
    "bdRightToLeftReadingOnly",
    "Apenas a ordem de leitura é invertida; layout permanece esquerda-para-direita.",
  ),
];
