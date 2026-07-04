import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Forms",
    kind: "namespace",
    type: "Forms",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Namespace para manipulação da interface de formulários e caixas de diálogo do ERP.",
  },
];
