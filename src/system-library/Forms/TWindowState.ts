import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const ws = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TWindowState",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TWindowState",
    kind: "class",
    type: "TWindowState",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Estado atual de uma janela (Form.WindowState).",
  },

  ws("wsNormal", "Janela em tamanho/posição normal."),
  ws("wsMinimized", "Janela minimizada."),
  ws("wsMaximized", "Janela maximizada."),
];
