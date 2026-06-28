import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

const ak = (name: string, description: string): SystemSymbolInfo => ({
  name: name,
  kind: "variable",
  type: "TAnchorKind",
  isShared: true,
  isPrivate: false,
  range: range,
  fileUri: "system://library",
  containerName: "Forms",
  description: description,
});

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TAnchorKind",
    kind: "class",
    type: "TAnchorKind",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Borda à qual o controle se ancora no seu parent (TControl.Anchors). Conjunto (set): TAnchors = set of TAnchorKind. Combine vários valores para ancorar em múltiplas bordas.",
  },

  ak("akLeft", "Ancora à borda esquerda do parent (mantém Left fixo)."),
  ak("akTop", "Ancora à borda superior do parent (mantém Top fixo)."),
  ak("akRight", "Ancora à borda direita (Width acompanha redimensionamento horizontal do parent)."),
  ak(
    "akBottom",
    "Ancora à borda inferior (Height acompanha redimensionamento vertical do parent).",
  ),
];
