import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCloseEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "Action", type: "Integer", isByRef: true, isOptional: false },
    ],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Assinatura do handler de Form.OnClose. Action recebe o tipo de fechamento (caNone, caHide, caFree, caMinimize) e pode ser alterado para mudar o comportamento.",
  },
];
