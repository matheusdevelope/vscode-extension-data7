import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Timer",
    kind: "class",
    type: "Timer",
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
    inheritsFrom: "TComponent",
    description:
      "Componente não-visual que dispara um evento (OnTimer) em intervalos regulares definidos por Interval (ms). Wrapper do TTimer nativo do Delphi.",
  },
];
