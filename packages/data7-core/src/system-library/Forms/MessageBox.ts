import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MessageBox",
    kind: "class",
    type: "MessageBox",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description: "Classe de exibição de mensagens.",
  },
  {
    name: "Show",
    kind: "method",
    type: "Integer",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pMessage",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MessageBox",
    description: "Exibe uma caixa de diálogo informativa com a mensagem informada.",
  },
  {
    name: "Confirmation",
    kind: "method",
    type: "Boolean",
    isShared: true,
    isPrivate: false,
    parameters: [
      {
        name: "pMessage",
        type: "String",
        isByRef: false,
        isOptional: false,
      },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "MessageBox",
    description:
      "Exibe uma caixa de confirmação (Sim/Não). Retorna True se o usuário escolheu Sim.",
  },
];
