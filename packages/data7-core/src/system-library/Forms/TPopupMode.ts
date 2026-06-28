import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPopupMode",
    kind: "class",
    type: "TPopupMode",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Comportamento do Form em relação ao estilo WS_POPUP do Windows. Use em Form.PopupMode em conjunto com Form.PopupParent.",
  },

  // ───────── Constantes ─────────
  {
    name: "pmNone",
    kind: "variable",
    type: "TPopupMode",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Sem comportamento popup — modo padrão do Windows (0).",
  },
  {
    name: "pmAuto",
    kind: "variable",
    type: "TPopupMode",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form é popup automaticamente baseado no contexto da aplicação (1).",
  },
  {
    name: "pmExplicit",
    kind: "variable",
    type: "TPopupMode",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form é popup explícito; usa Form.PopupParent como dono (2).",
  },
];
