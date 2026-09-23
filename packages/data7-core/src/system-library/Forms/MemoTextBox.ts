import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MemoTextBox",
    kind: "class",
    type: "MemoTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Caixa de texto multilinha do Data7 (TMemoEditor). Wrapper sobre TcxMemo.",
  },

  // ───────── Properties ─────────
  {
    name: "Lines",
    kind: "property",
    type: "TStringList",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MemoTextBox",
    description: "Lista de linhas do memo (TStrings). Cada item corresponde a uma linha textual.",
  },
  {
    name: "WordWrap",
    kind: "property",
    type: "Boolean",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MemoTextBox",
    description: "Se linhas longas quebram automaticamente no fim da área visível.",
  },
  {
    name: "ScrollBars",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MemoTextBox",
    description: "Quais barras de rolagem exibir (ssNone, ssHorizontal, ssVertical, ssBoth).",
  },
];
