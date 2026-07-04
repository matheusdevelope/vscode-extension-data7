import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ButtonCancel",
    kind: "class",
    type: "ButtonCancel",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TButtonControl",
    description:
      'Variante de CommandButton pré-configurada como botão de cancelamento ("Cancelar") do diálogo.',
  },
];
