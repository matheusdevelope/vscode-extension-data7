import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TDefaultMonitor",
    kind: "class",
    type: "TDefaultMonitor",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Define em qual monitor o Form aparece em aplicações multi-monitor (Form.DefaultMonitor).",
  },

  // ───────── Constantes ─────────
  {
    name: "dmDesktop",
    kind: "variable",
    type: "TDefaultMonitor",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Nenhuma tentativa de posicionar o form em um monitor específico (0).",
  },
  {
    name: "dmPrimary",
    kind: "variable",
    type: "TDefaultMonitor",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form é posicionado no primeiro monitor listado em Screen.Monitors (1).",
  },
  {
    name: "dmMainForm",
    kind: "variable",
    type: "TDefaultMonitor",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form aparece no mesmo monitor do formulário principal da aplicação (2).",
  },
  {
    name: "dmActiveForm",
    kind: "variable",
    type: "TDefaultMonitor",
    isShared: true,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Form aparece no mesmo monitor do formulário atualmente ativo (3).",
  },
];
