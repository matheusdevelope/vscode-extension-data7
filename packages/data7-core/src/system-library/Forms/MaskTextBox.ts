import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MaskTextBox",
    kind: "class",
    type: "MaskTextBox",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description: "Variante de TextBox configurada para entrada de mascaras (caracteres mascarados).",
  },
  {
    name: "Mascara",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "MaskTextBox",
    description: "Máscara aplicada ao editor.",
  },
  {
    name: "AsString",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "MaskTextBox",
    description: "Valor selecionado como String (geralmente o código do registro).",
  },
];
