import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TAlign",
  description:
    "Tipo de alinhamento de um controle dentro do seu container (TControl.Align). Valores possíveis (declarados globalmente, sem necessidade de Imports): alNone, alTop, alBottom, alLeft, alRight, alClient.",
  values: [
    ["alNone", "Sem alinhamento automático."],
    ["alTop", "Alinhado ao topo do container."],
    ["alBottom", "Alinhado à base do container."],
    ["alLeft", "Alinhado à esquerda do container."],
    ["alRight", "Alinhado à direita do container."],
    ["alClient", "Preenche toda a área restante do container."],
  ],
});
