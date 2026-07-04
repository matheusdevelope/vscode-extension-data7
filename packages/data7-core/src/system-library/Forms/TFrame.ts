import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFrame",
    kind: "class",
    type: "TFrame",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TScrollingWinControl",
    description:
      "Base para componentes compostos reutilizáveis embutidos em formulários (frames). Funciona como container similar ao TForm mas projetado para ser colocado dentro de outros containers.",
  },
  // TFrame/TCustomFrame não adicionam membros públicos além de Create/Destroy/GetChildren
  // (todos já herdados de TScrollingWinControl/TWinControl/TControl/TComponent).
];
