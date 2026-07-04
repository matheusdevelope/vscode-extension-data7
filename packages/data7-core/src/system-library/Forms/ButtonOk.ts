import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "ButtonOk",
    kind: "class",
    type: "ButtonOk",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    inheritsFrom: "TButtonControl",
    description:
      'Variante de CommandButton pré-configurada como botão de confirmação ("Ok"/"Confirmar") do diálogo.',
  },
];
