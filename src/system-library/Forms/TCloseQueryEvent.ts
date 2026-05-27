import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TCloseQueryEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "CanClose", type: "Boolean", isByRef: true, isOptional: false },
    ],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Assinatura do handler de Form.OnCloseQuery. Defina CanClose := False no handler para impedir o fechamento (ex.: confirmar com o usuário antes de fechar).",
  },
];
