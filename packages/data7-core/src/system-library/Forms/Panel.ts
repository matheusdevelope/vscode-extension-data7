import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Panel",
    kind: "class",
    type: "Panel",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TCustomControl",
    description:
      "Container retangular genérico para agrupar e posicionar outros controles. Wrapper sobre TCustomPanel da VCL.",
  },
];
