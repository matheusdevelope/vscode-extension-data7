import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const mb = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TMouseButton",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TMouseButton",
    kind: "class",
    type: "TMouseButton",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    description:
      "Botão do mouse identificado em eventos OnMouseDown/OnMouseUp. Acessível globalmente.",
  },

  mb("mbLeft", "Botão esquerdo do mouse."),
  mb("mbRight", "Botão direito do mouse."),
  mb("mbMiddle", "Botão central (scroll) do mouse."),
];
