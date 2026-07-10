import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TWindowState",
  containerName: "Forms",
  description: "Estado atual de uma janela (Form.WindowState).",
  values: [
    ["wsNormal", "Janela em tamanho/posição normal."],
    ["wsMinimized", "Janela minimizada."],
    ["wsMaximized", "Janela maximizada."],
  ],
});
