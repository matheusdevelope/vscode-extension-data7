import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CustomControl",
    kind: "class",
    type: "CustomControl",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TCustomControl",
    description:
      "Controle customizável reutilizável pelo desenvolvedor no Data7. Especialização de TCustomControl com infraestrutura padrão do ERP.",
  },
];
