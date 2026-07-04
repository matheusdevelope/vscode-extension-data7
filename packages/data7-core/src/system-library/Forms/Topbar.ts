import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Topbar",
    kind: "class",
    type: "Topbar",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TFrame",
    description:
      "Frame de barra superior padrão do Data7 (cabeçalho) usado nos formulários do ERP.",
  },
];
