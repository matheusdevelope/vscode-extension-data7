import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TNotifyEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [{ name: "Sender", type: "TObject", isByRef: false, isOptional: false }],
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    description:
      "Assinatura padrão de eventos sem parâmetros adicionais (OnClick, OnShow, OnHide, OnEnter, OnExit, OnCreate, OnDestroy, etc.). Sender é o componente que disparou o evento.",
  },
];
