import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const lp = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TLabelPosition",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TLabelPosition",
    kind: "class",
    type: "TLabelPosition",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Posição do rótulo (TBoundLabel) em relação ao controle de edição associado. Usado em TLabeledEdit.LabelPosition.",
  },

  lp("lpAbove", "Rótulo acima do edit."),
  lp("lpBelow", "Rótulo abaixo do edit."),
  lp("lpLeft", "Rótulo à esquerda do edit."),
  lp("lpRight", "Rótulo à direita do edit."),
];
