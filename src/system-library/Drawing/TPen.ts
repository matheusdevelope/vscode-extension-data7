import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TPen",
    kind: "class",
    type: "TPen",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "Drawing",
    inheritsFrom: "TObject",
    description: "Gerencia a largura e cor das linhas desenhadas no Canvas.",
  },
  {
    name: "Width",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "TPen",
    description: "Largura/espessura da caneta.",
  },
  {
    name: "Color",
    kind: "property",
    type: "Integer",
    isShared: false,
    isPrivate: false,
    range: {
      startLine: 0,
      startChar: 0,
      endLine: 0,
      endChar: 0,
    },
    fileUri: "system://library",
    containerName: "TPen",
    description: "Cor da linha da caneta.",
  },
];
