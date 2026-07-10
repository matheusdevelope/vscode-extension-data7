import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TPrintScale",
  containerName: "Forms",
  description: "Proporções de impressão de um Form (Form.PrintScale).",
  values: [
    ["poNone", "Sem escala — pode aparecer comprimido ou esticado na impressão (0)."],
    [
      "poProportional",
      "Imprime no tamanho aproximadamente igual ao que aparece na tela (WYSIWYG) (1).",
    ],
    ["poPrintToFit", "Mantém as proporções da tela mas ajusta o tamanho à página (2)."],
  ],
});
