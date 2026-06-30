import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TMouseButton",
    kind: "class",
    type: "TMouseButton",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Botão do mouse identificado em eventos OnMouseDown/OnMouseUp. Acessível globalmente.",
  },

  buildEnumVal("mbLeft", "TMouseButton", "Botão esquerdo do mouse."),
  buildEnumVal("mbRight", "TMouseButton", "Botão direito do mouse."),
  buildEnumVal("mbMiddle", "TMouseButton", "Botão central (scroll) do mouse."),
];
