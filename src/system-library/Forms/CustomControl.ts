import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "CustomControl",
    kind: "class",
    type: "CustomControl",
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
    inheritsFrom: "TCustomControl",
    description:
      "Controle customizável reutilizável pelo desenvolvedor no Data7. Especialização de TCustomControl com infraestrutura padrão do ERP.",
  },
];
