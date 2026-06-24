import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TAlign",
    kind: "class",
    type: "TAlign",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    description:
      "Tipo de alinhamento de um controle dentro do seu container (TControl.Align). Valores possíveis (declarados globalmente, sem necessidade de Imports): alNone, alTop, alBottom, alLeft, alRight, alClient.",
  },
];
