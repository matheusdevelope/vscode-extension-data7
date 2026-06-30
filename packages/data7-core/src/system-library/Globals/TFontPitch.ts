import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFontPitch",
    kind: "class",
    type: "TFontPitch",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Enumeração para definir o pitch da fonte.",
  },

  buildEnumVal("fpDefault", "TFontPitch", "Use o pitch padrão da fonte."),
  buildEnumVal("fpFixed", "TFontPitch", "Use um pitch fixo."),
  buildEnumVal("fpVariable", "TFontPitch", "Use um pitch variável."),
];
