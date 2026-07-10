import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TFormStyle",
  containerName: "Forms",
  description: "Estilo do Form (normal, MDI parent/child, sempre no topo). Use em Form.FormStyle.",
  values: [
    ["fsNormal", "Form normal — não é janela MDI parent nem MDI child (0)."],
    ["fsMDIChild", "Form é uma janela MDI child (filha) (1)."],
    ["fsMDIForm", "Form é uma janela MDI parent (mãe) (2)."],
    [
      "fsStayOnTop",
      "Form permanece sempre no topo da área de trabalho e dos demais forms do projeto (3).",
    ],
  ],
});
