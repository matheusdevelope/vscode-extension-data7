import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "GridConfigs",
    kind: "class",
    type: "GridConfigs",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
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
      range: SYSTEM_RANGE,
      fileUri: SYSTEM_URI,
      containerName: "GridConfigs",
      description: `Flag de comportamento visual/interativo de GridConfigs (${name}).`,
    }),
  ),
];
