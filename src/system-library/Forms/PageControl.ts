import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "PageControl",
    kind: "class",
    type: "PageControl",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TCustomControl",
    description:
      "Container de abas (TabSheets) — wrapper sobre o TRzPageControl da Raize. Permite alternar entre múltiplas páginas filhas.",
  },
];
