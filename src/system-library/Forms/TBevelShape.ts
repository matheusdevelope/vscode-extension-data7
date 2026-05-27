import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bs = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBevelShape",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBevelShape",
    kind: "class",
    type: "TBevelShape",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Forma de uma Border (TBevel). Define se o bevel é um retângulo cheio, uma linha simples ou apenas um espaçador.",
  },

  bs("bsBox", "Caixa retangular preenchida (4 lados)."),
  bs("bsFrame", "Moldura retangular (4 lados, sem preenchimento)."),
  bs("bsTopLine", "Apenas uma linha no topo."),
  bs("bsBottomLine", "Apenas uma linha na base."),
  bs("bsLeftLine", "Apenas uma linha à esquerda."),
  bs("bsRightLine", "Apenas uma linha à direita."),
  bs("bsSpacer", "Espaçador invisível (não desenha nada, ocupa apenas espaço)."),
];
