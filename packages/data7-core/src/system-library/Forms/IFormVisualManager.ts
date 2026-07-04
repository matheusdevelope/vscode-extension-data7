import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "IFormVisualManager",
    kind: "class",
    type: "IFormVisualManager",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Interface que descreve um gerenciador visual de formulários do Data7 — controla skins, layouts e temas aplicados aos forms do ERP.",
  },
];
