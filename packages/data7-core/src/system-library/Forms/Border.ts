import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Border",
    kind: "class",
    type: "Border",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Border",
    description: "Estilo visual: bsLowered (rebaixada) ou bsRaised (elevada).",
  },
];
