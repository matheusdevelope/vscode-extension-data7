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
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    description:
      "Assinatura dos eventos OnKeyDown/OnKeyUp. Key é o virtual key code (modifique por ByRef para alterar/cancelar a tecla, ex.: Key := 0). Shift indica modificadoras.",
  },
];
