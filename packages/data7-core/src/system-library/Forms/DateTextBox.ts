import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "DateTextBox",
    kind: "class",
    type: "DateTextBox",
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
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Caixa de texto especializada em entrada de datas (TDataEditor) com botão de calendário (dropdown). Wrapper sobre TcxDateEdit.",
  },

  // ───────── Properties (Data7-specific date access) ─────────
  {
    name: "AsDate",
    kind: "property",
    type: "TDateTime",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "DateTextBox",
    description: "Valor atual do editor como TDateTime — atalho para Date.",
  },
  {
    name: "Date",
    kind: "property",
    type: "TDateTime",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "DateTextBox",
    description: "Data selecionada no editor (parte de hora zerada).",
  },
];
