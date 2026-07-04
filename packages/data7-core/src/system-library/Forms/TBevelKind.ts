import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

const bk = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBevelKind",
  isShared: true,
  isPrivate: false,
  range: SYSTEM_RANGE,
  fileUri: SYSTEM_URI,
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBevelKind",
    kind: "class",
    type: "TBevelKind",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Tipo de bevel (efeito 3D) usado em molduras de controles.",
  },

  bk("bkNone", "Sem bevel."),
  bk("bkTile", "Bevel em mosaico (efeito de tijolos)."),
  bk("bkSoft", "Bevel suave (sombra leve)."),
  bk("bkFlat", "Bevel plano (linha única)."),
];
