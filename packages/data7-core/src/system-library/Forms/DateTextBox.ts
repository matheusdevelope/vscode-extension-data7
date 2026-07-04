import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "DateTextBox",
    kind: "class",
    type: "DateTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "DateTextBox",
    description: "Valor atual do editor como TDateTime — atalho para Date.",
  },
  {
    name: "Date",
    kind: "property",
    type: "TDateTime",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "DateTextBox",
    description: "Data selecionada no editor (parte de hora zerada).",
  },
];
