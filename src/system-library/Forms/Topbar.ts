import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Topbar",
    kind: "class",
    type: "Topbar",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Forms",
    inheritsFrom: "TFrame",
    description:
      "Frame de barra superior padrão do Data7 (cabeçalho) usado nos formulários do ERP.",
  },
];
