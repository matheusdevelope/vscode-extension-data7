import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TPopupMode",
  containerName: "Forms",
  description:
    "Comportamento do Form em relação ao estilo WS_POPUP do Windows. Use em Form.PopupMode em conjunto com Form.PopupParent.",
  values: [
    ["pmNone", "Sem comportamento popup — modo padrão do Windows (0)."],
    ["pmAuto", "Form é popup automaticamente baseado no contexto da aplicação (1)."],
    ["pmExplicit", "Form é popup explícito; usa Form.PopupParent como dono (2)."],
  ],
});
