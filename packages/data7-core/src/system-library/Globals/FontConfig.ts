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
      fileUri: "system://library",
      description: "Gerencia as configurações de fontes (TFont) utilizadas nos componentes.",
      inheritsFrom: "TFont"
   },
];
