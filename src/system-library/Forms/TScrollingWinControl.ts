import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TScrollingWinControl",
    kind: "class",
    type: "TScrollingWinControl",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TWinControl",
    description:
      "Base para containers visuais com barras de rolagem horizontal e vertical (TForm, TFrame). Adiciona controle de viewport e auto-scroll.",
  },

  // ───────── Properties ─────────
  {
    name: "HorzScrollBar",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TScrollingWinControl",
    description: "Representa a barra de rolagem horizontal do controle.",
  },
  {
    name: "VertScrollBar",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TScrollingWinControl",
    description: "Representa a barra de rolagem vertical do controle.",
  },

  // ───────── Methods ─────────
  {
    name: "DisableAutoRange",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TScrollingWinControl",
    description: "Desabilita a rolagem automática.",
  },
  {
    name: "EnableAutoRange",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TScrollingWinControl",
    description: "Reabilita a rolagem automática.",
  },
  {
    name: "ScrollInView",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [{ name: "AControl", type: "TControl", isByRef: false, isOptional: false }],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "TScrollingWinControl",
    description: "Rola um controle para dentro da área visível do controle de rolagem.",
  },
];
