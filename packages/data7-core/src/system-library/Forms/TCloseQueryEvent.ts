import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
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
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Assinatura do handler de Form.OnCloseQuery. Defina CanClose := False no handler para impedir o fechamento (ex.: confirmar com o usuário antes de fechar).",
  },
];
