import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "GridConfigs",
    kind: "class",
    type: "GridConfigs",
    isShared: false,
    isPrivate: false,
    range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
    fileUri: "system://library",
    containerName: "Forms",
    description:
      "Configurações de Grid do Data7 — agrega opções de layout, scrollbars, ordenação, agrupamento e estilização aplicadas a um componente Grid.",
  },
  ...[
    "FixedVerLine",
    "FixedHorzLine",
    "VerLine",
    "HorzLine",
    "RowSizing",
    "ColSizing",
    "RowMoving",
    "ColMoving",
    "RowSelect",
    "FixedColClick",
    "FixedRowClick",
    "FixedHotTrack",
  ].map(
    (name): SystemSymbolInfo => ({
      name,
      kind: "property",
      type: "Boolean",
      isShared: false,
      isPrivate: false,
      range: { startLine: 0, startChar: 0, endLine: 0, endChar: 0 },
      fileUri: "system://library",
      containerName: "GridConfigs",
      description: `Flag de comportamento visual/interativo de GridConfigs (${name}).`,
    }),
  ),
];
