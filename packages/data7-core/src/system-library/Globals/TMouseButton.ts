import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TMouseButton",
  description:
    "Botão do mouse identificado em eventos OnMouseDown/OnMouseUp. Acessível globalmente.",
  values: [
    ["mbLeft", "Botão esquerdo do mouse."],
    ["mbRight", "Botão direito do mouse."],
    ["mbMiddle", "Botão central (scroll) do mouse."],
  ],
});
