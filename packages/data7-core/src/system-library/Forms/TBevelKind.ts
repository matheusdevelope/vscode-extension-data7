import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const bk = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TBevelKind",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBevelKind",
    kind: "class",
    type: "TBevelKind",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description: "Tipo de bevel (efeito 3D) usado em molduras de controles.",
  },

  bk("bkNone", "Sem bevel."),
  bk("bkTile", "Bevel em mosaico (efeito de tijolos)."),
  bk("bkSoft", "Bevel suave (sombra leve)."),
  bk("bkFlat", "Bevel plano (linha única)."),
];
