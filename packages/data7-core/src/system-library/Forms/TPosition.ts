import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TPosition",
  containerName: "Forms",
  description: "Descreve o posicionamento de um Form na tela (Form.Position).",
  values: [
    ["poDesigned", "Form aparece com a posição/tamanho que tinha em tempo de design (0)."],
    ["poDefault", "Posição e tamanho determinados pelo sistema operacional (1)."],
    ["poDefaultPosOnly", "Mantém o tamanho de design; sistema operacional escolhe a posição (2)."],
    ["poDefaultSizeOnly", "Mantém a posição de design; sistema operacional escolhe o tamanho (3)."],
    ["poScreenCenter", "Centralizado na tela; mantém o tamanho de design (4)."],
    ["poDesktopCenter", "Centralizado no desktop; mantém o tamanho de design (5)."],
    [
      "poMainFormCenter",
      "Centralizado no Form principal da aplicação — apenas para forms secundários (6).",
    ],
    [
      "poOwnerFormCenter",
      "Centralizado no Form do Owner (cai em poMainFormCenter se Owner não for Form) (7).",
    ],
  ],
});
