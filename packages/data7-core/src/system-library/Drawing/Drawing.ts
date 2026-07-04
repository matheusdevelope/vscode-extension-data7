import { SYSTEM_RANGE, SYSTEM_URI } from "../symbol-helpers";
import type { SystemSymbolInfo } from "../types";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "Drawing",
    kind: "namespace",
    type: "Drawing",
    isShared: true,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description:
      "Namespace nativo do Data7 para recursos gráficos e de desenho (TCanvas, TPen, etc.).",
  },
];
