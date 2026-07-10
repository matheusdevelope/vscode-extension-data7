import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TBevelKind",
  containerName: "Forms",
  description: "Tipo de bevel (efeito 3D) usado em molduras de controles.",
  values: [
    ["bkNone", "Sem bevel."],
    ["bkTile", "Bevel em mosaico (efeito de tijolos)."],
    ["bkSoft", "Bevel suave (sombra leve)."],
    ["bkFlat", "Bevel plano (linha única)."],
  ],
});
