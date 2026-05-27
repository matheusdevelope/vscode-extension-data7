import type { SystemSymbolInfo } from "../types";

const range = { startLine: 0, startChar: 0, endLine: 0, endChar: 0 } as const;

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TBorderStyle",
    kind: "class",
    type: "TBorderStyle",
    isShared: false,
    isPrivate: false,
    range: range,
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Tipo da propriedade BorderStyle de controles com moldura (Panel, Grid, edits). Sobreposto com TFormBorderStyle: aqui só existem bsNone/bsSingle (controles de moldura simples).",
  },
  // Nota: bsNone e bsSingle já estão declarados em TFormBorderStyle.ts; aceitos para ambos.
];
