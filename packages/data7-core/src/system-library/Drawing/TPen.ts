import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPen",
    kind: "class",
    type: "TPen",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Drawing",
    inheritsFrom: "TObject",
    description: "Gerencia a largura e cor das linhas desenhadas no Canvas.",
  },
  {
    name: "Width",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TPen",
    description: "Largura/espessura da caneta.",
  },
  {
    name: "Color",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TPen",
    description: "Cor da linha da caneta.",
  },
];
