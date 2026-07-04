import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFormBorderStyle",
    kind: "class",
    type: "TFormBorderStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Estilo da borda e comportamento de redimensionamento de um Form (Form.BorderStyle).",
  },

  // ───────── Constantes ─────────
  {
    name: "bsNone",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Não redimensionável; sem borda visível (0).",
  },
  {
    name: "bsSingle",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Não redimensionável; com menu de minimizar/maximizar (1).",
  },
  {
    name: "bsSizeable",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Borda redimensionável padrão (2).",
  },
  {
    name: "bsDialog",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Borda de diálogo; não redimensionável e sem menu minimizar/maximizar (3).",
  },
  {
    name: "bsToolWindow",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Como bsSingle mas com caption menor (estilo tool window) (4).",
  },
  {
    name: "bsSizeToolWin",
    kind: "variable",
    type: "TFormBorderStyle",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Como bsSizeable com caption menor (estilo tool window redimensionável) (5).",
  },
];
