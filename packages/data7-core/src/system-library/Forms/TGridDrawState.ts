import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TGridDrawState",
  containerName: "Forms",
  description:
    "Conjunto (set) de flags que descrevem o estado de desenho de uma célula do Grid no momento do evento OnDrawCell. Várias flags podem estar ativas simultaneamente.",
  values: [
    ["gdSelected", "Célula está selecionada (0)."],
    ["gdFocused", "Célula está com o foco (1)."],
    ["gdFixed", "Célula está em uma coluna/linha fixa (cabeçalho) (2)."],
    ["gdRowSelected", "Toda a linha desta célula está selecionada (3)."],
    ["gdHotTrack", "Mouse está hover sobre a célula (hot-track) (4)."],
    ["gdPressed", "Célula está pressionada (botão de mouse down) (5)."],
  ],
});
