import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFrame",
    kind: "class",
    type: "TFrame",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TScrollingWinControl",
    description:
      "Base para componentes compostos reutilizáveis embutidos em formulários (frames). Funciona como container similar ao TForm mas projetado para ser colocado dentro de outros containers.",
  },
  // TFrame/TCustomFrame não adicionam membros públicos além de Create/Destroy/GetChildren
  // (todos já herdados de TScrollingWinControl/TWinControl/TControl/TComponent).
];
