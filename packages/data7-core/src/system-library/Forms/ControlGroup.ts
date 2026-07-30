import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ControlGroup",
    kind: "class",
    type: "ControlGroup",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TGraphicControl",
    description:
      "Agrupador visual de controles desenhado via Canvas (sem janela própria). Equivalente ao TControlGroup do Data7.",
  },
  {
    name: "Color",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "ControlGroup",
    description: "Cor associada ao agrupador visual.",
  },
  {
    name: "Text",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "ControlGroup",
    description: "Texto associado ao agrupador visual.",
  },
  {
    name: "Caption",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "ControlGroup",
    description: "Texto associado ao agrupador visual, exibido em tela.",
  },
];
