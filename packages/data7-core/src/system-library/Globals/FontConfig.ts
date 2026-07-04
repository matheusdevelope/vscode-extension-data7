import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "FontConfig",
    kind: "class",
    type: "FontConfig",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    description: "Gerencia as configurações de fontes (TFont) utilizadas nos componentes.",
    inheritsFrom: "TFont",
  },
];
