import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TRoundedCornerType",
    kind: "class",
    type: "TRoundedCornerType",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Tipo de arredondamento dos cantos do Form (Windows 11+). Use em Form.RoundedCornerType.",
  },

  // ───────── Constantes ─────────
  {
    name: "rcDefault",
    kind: "variable",
    type: "TRoundedCornerType",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Comportamento padrão do sistema (decisão do Windows) (0).",
  },
  {
    name: "rcOff",
    kind: "variable",
    type: "TRoundedCornerType",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Cantos retos — sem arredondamento (1).",
  },
  {
    name: "rcOn",
    kind: "variable",
    type: "TRoundedCornerType",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Cantos arredondados (raio padrão do Windows 11) (2).",
  },
  {
    name: "rcSmall",
    kind: "variable",
    type: "TRoundedCornerType",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Cantos arredondados com raio pequeno (3).",
  },
];
