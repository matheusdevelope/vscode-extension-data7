import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TKeyEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "Key", type: "Integer", isByRef: true, isOptional: false },
      { name: "Shift", type: "TShiftState", isByRef: false, isOptional: false },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Assinatura dos eventos OnKeyDown/OnKeyUp. Key é o virtual key code (modifique por ByRef para alterar/cancelar a tecla, ex.: Key := 0). Shift indica modificadoras.",
  },
];
