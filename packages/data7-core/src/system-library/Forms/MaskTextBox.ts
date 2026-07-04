import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MaskTextBox",
    kind: "class",
    type: "MaskTextBox",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TcxCustomTextEdit",
    description:
      "Variante de TextBox configurada para entrada de mascaras (caracteres mascarados).",
  },
  {
    name: "Mascara",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MaskTextBox",
    description: "Máscara aplicada ao editor.",
  },
  {
    name: "AsString",
    kind: "property",
    type: "String",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MaskTextBox",
    description: "Valor selecionado como String (geralmente o código do registro).",
  },
];
