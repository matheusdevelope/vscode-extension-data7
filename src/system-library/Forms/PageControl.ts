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

  // ───────── Properties ─────────
  {
    name: "ActivePageIndex",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "PageControl",
    description: "Obtem e define a tabsheet ativa no PageControl.",
  },
  {
    name: "PageCount",
    kind: "property",
    isReadOnly: true,
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "PageControl",
    description: "Obtem o número de tabsheets no PageControl.",
  },
  {
    name: "ShowShadow",
    kind: "property",
    type: "Boolean",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "PageControl",
    description: "Determina se exibe sombra no controle de abas.",
  },
  {
    name: "TabIndex",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "PageControl",
    description: "Índice da aba ativa.",
  },
];
