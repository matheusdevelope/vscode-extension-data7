import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TNotifyEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [{ name: "Sender", type: "TObject", isByRef: false, isOptional: false }],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Assinatura padrão de eventos sem parâmetros adicionais (OnClick, OnShow, OnHide, OnEnter, OnExit, OnCreate, OnDestroy, etc.). Sender é o componente que disparou o evento.",
  },
];
