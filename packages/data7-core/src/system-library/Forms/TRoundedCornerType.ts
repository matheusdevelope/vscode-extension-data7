import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TRoundedCornerType",
  containerName: "Forms",
  description:
    "Tipo de arredondamento dos cantos do Form (Windows 11+). Use em Form.RoundedCornerType.",
  values: [
    ["rcDefault", "Comportamento padrão do sistema (decisão do Windows) (0)."],
    ["rcOff", "Cantos retos — sem arredondamento (1)."],
    ["rcOn", "Cantos arredondados (raio padrão do Windows 11) (2)."],
    ["rcSmall", "Cantos arredondados com raio pequeno (3)."],
  ],
});
