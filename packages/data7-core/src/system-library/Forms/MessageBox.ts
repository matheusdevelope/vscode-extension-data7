import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "MessageBox",
    kind: "class",
    type: "MessageBox",
    isShared: true,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
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
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
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
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "MessageBox",
    description:
      "Exibe uma caixa de confirmação (Sim/Não). Retorna True se o usuário escolheu Sim.",
  },
];
