import type { SystemSymbolInfo } from "../types";
import { buildClassSymbols, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  ...buildClassSymbols({
    className: "TBorderIcon",
    namespaceContainer: "Forms",
    description:
      "Ícone presente na barra de título de um Form (Form.BorderIcons). Conjunto (set): TBorderIcons = set of TBorderIcon.",
  }),
  ...buildClassSymbols({
    className: "TBorderIcons",
    namespaceContainer: "Forms",
    description:
      "Set Delphi `set of TBorderIcon` — coleção de ícones exibidos na barra de título do formulário (biSystemMenu, biMinimize, biMaximize, biHelp).",
  }),
  buildEnumVal(
    "biSystemMenu",
    "TBorderIcon",
    "Menu de sistema (ícone do app no canto esquerdo).",
    "Forms",
  ),
  buildEnumVal("biMinimize", "TBorderIcon", "Botão de minimizar.", "Forms"),
  buildEnumVal("biMaximize", "TBorderIcon", "Botão de maximizar.", "Forms"),
  buildEnumVal(
    "biHelp",
    "TBorderIcon",
    'Botão de ajuda ("?" — usado em diálogos modais).',
    "Forms",
  ),
  buildEnumVal(
    "biAlwaysOnTop",
    "TBorderIcon",
    "Indicador de janela sempre no topo (em alguns temas).",
    "Forms",
  ),
];
