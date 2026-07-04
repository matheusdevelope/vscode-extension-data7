import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TMonitorDpiChangedEvent",
    kind: "delegate",
    type: "Void",
    isShared: false,
    isPrivate: false,
    parameters: [
      { name: "Sender", type: "TObject", isByRef: false, isOptional: false },
      { name: "OldDPI", type: "Integer", isByRef: false, isOptional: false },
      { name: "NewDPI", type: "Integer", isByRef: false, isOptional: false },
    ],
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    containerName: "Forms",
    description:
      "Assinatura do handler do evento OnAfterMonitorDpiChanged / OnBeforeMonitorDpiChanged do Form. Disparado quando o DPI do monitor onde o form está exibido muda.",
  },
];
