import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Border",
    kind: "class",
    type: "Border",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TGraphicControl",
    description:
      "Borda decorativa (wrapper sobre TBevel) usada para separar visualmente seções de um formulário.",
  },

  // ───────── Properties ─────────
  {
    name: "Shape",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Border",
    description:
      "Forma da borda (bsBox, bsFrame, bsTopLine, bsBottomLine, bsLeftLine, bsRightLine, bsSpacer).",
  },
  {
    name: "Style",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Border",
    description: "Estilo visual: bsLowered (rebaixada) ou bsRaised (elevada).",
  },
];
