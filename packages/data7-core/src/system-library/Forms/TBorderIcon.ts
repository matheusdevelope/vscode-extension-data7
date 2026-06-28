import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bi = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBorderIcon",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBorderIcon",
    kind: "class",
    type: "TBorderIcon",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Ícone presente na barra de título de um Form (Form.BorderIcons). Conjunto (set): TBorderIcons = set of TBorderIcon.",
  },
  {
    name: "TBorderIcons",
    kind: "class",
    type: "TBorderIcons",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Set Delphi `set of TBorderIcon` — coleção de ícones exibidos na barra de título do formulário (biSystemMenu, biMinimize, biMaximize, biHelp).",
  },

  bi("biSystemMenu", "Menu de sistema (ícone do app no canto esquerdo)."),
  bi("biMinimize", "Botão de minimizar."),
  bi("biMaximize", "Botão de maximizar."),
  bi("biHelp", 'Botão de ajuda ("?" — usado em diálogos modais).'),
  bi("biAlwaysOnTop", "Indicador de janela sempre no topo (em alguns temas)."),
];
