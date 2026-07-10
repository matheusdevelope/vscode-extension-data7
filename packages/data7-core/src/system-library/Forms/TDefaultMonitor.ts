import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TDefaultMonitor",
  containerName: "Forms",
  description:
    "Define em qual monitor o Form aparece em aplicações multi-monitor (Form.DefaultMonitor).",
  values: [
    ["dmDesktop", "Nenhuma tentativa de posicionar o form em um monitor específico (0)."],
    ["dmPrimary", "Form é posicionado no primeiro monitor listado em Screen.Monitors (1)."],
    ["dmMainForm", "Form aparece no mesmo monitor do formulário principal da aplicação (2)."],
    ["dmActiveForm", "Form aparece no mesmo monitor do formulário atualmente ativo (3)."],
  ],
});
