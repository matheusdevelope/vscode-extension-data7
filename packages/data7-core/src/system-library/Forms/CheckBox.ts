import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CheckBox",
    kind: "class",
    type: "CheckBox",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TcxCustomEdit",
    description:
      "Caixa de seleção (verdadeiro/falso/grayed) padrão Data7. Wrapper sobre TcxCheckBox.",
  },

  // ───────── Properties ─────────
  {
    name: "Checked",
    kind: "property",
    type: "Boolean",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "CheckBox",
    description:
      "Indica se a caixa está marcada (True) ou desmarcada (False). Atalho para State = cbsChecked.",
  },
  {
    name: "State",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "CheckBox",
    description:
      "Estado da caixa: cbsUnchecked (0), cbsChecked (1) ou cbsGrayed (2 — apenas quando AllowGrayed = True).",
  },

  // ───────── Methods ─────────
  {
    name: "Toggle",
    kind: "method",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "CheckBox",
    description:
      "Alterna o estado da caixa entre marcado e desmarcado (e cinza, quando AllowGrayed = True).",
  },
];
