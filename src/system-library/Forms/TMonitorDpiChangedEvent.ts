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
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Assinatura do handler do evento OnAfterMonitorDpiChanged / OnBeforeMonitorDpiChanged do Form. Disparado quando o DPI do monitor onde o form está exibido muda.",
  },
];
