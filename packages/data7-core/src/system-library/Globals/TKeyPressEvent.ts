import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TKeyPressEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "Key", type: "Char", isByRef: true, isOptional: false },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Assinatura do evento OnKeyPress. Key é o caractere digitado (modifique por ByRef para alterar ou cancelar — Key := #0 cancela). Disparado entre OnKeyDown e OnKeyUp para teclas imprimíveis.",
  },
];
