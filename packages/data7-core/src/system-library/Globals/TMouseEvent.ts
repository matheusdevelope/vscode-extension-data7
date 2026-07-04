import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TMouseEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "Button", type: "TMouseButton", isByRef: false, isOptional: false },
      { name: "Shift", type: "TShiftState", isByRef: false, isOptional: false },
      { name: "X", type: "Integer", isByRef: false, isOptional: false },
      { name: "Y", type: "Integer", isByRef: false, isOptional: false },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Assinatura dos eventos OnMouseDown/OnMouseUp. Button indica qual botão, Shift as teclas modificadoras pressionadas, X/Y as coordenadas do ponteiro relativas ao controle.",
  },
];
