import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TShiftState",
  containerName: "Forms",
  description:
    "Indica o estado das teclas modificadoras, botões do mouse ou dispositivos touch. Usado por handlers de eventos de teclado e mouse para detectar combinações no momento do evento. É um conjunto (set) de valores ssXxx (vários podem estar ativos simultaneamente).",
  values: [
    ["ssShift", "A tecla SHIFT está pressionada."],
    ["ssAlt", "A tecla ALT está pressionada."],
    ["ssCtrl", "A tecla CTRL está pressionada."],
    ["ssLeft", "Botão esquerdo do mouse está pressionado."],
    ["ssRight", "Botão direito do mouse está pressionado."],
    ["ssMiddle", "Botão central (scroll) do mouse está pressionado."],
    ["ssDouble", "O botão do mouse recebeu um duplo-clique."],
    ["ssTouch", "O usuário está mantendo o dedo sobre a superfície touch."],
    ["ssPen", "A caneta (stylus) está tocando a superfície de um tablet."],
    ["ssCommand", "A tecla CMD está pressionada (apenas no macOS)."],
    ["ssHorizontal", "Movimento horizontal no touch ou wheel produzindo deslocamento horizontal."],
  ],
});
