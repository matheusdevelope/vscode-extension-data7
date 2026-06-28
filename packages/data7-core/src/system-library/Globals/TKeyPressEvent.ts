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
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    description:
      "Assinatura do evento OnKeyPress. Key é o caractere digitado (modifique por ByRef para alterar ou cancelar — Key := #0 cancela). Disparado entre OnKeyDown e OnKeyUp para teclas imprimíveis.",
  },
];
