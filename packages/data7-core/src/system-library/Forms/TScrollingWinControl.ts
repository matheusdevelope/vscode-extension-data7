import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TScrollingWinControl",
    kind: "class",
    type: "TScrollingWinControl",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TScrollingWinControl",
    description: "Representa a barra de rolagem horizontal do controle.",
  },
  {
    name: "VertScrollBar",
    kind: "property",
    type: "Variant",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "TScrollingWinControl",
    description: "Rola um controle para dentro da área visível do controle de rolagem.",
  },
];
