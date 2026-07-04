import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Collections",
    kind: "namespace",
    type: "Collections",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Namespace nativo do Data7 para estruturas de dados e coleções (StringList, etc.).",
  },
];
