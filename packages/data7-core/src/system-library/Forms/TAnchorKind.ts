import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TAnchorKind",
  containerName: "Forms",
  description:
    "Borda à qual o controle se ancora no seu parent (TControl.Anchors). Conjunto (set): TAnchors = set of TAnchorKind. Combine vários valores para ancorar em múltiplas bordas.",
  values: [
    ["akLeft", "Ancora à borda esquerda do parent (mantém Left fixo)."],
    ["akTop", "Ancora à borda superior do parent (mantém Top fixo)."],
    ["akRight", "Ancora à borda direita (Width acompanha redimensionamento horizontal do parent)."],
    [
      "akBottom",
      "Ancora à borda inferior (Height acompanha redimensionamento vertical do parent).",
    ],
  ],
});
