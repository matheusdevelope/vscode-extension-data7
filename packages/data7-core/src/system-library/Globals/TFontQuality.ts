import type { SystemSymbolInfo } from "../types";
import { SYSTEM_RANGE, SYSTEM_URI, buildEnumVal } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = [
  {
    name: "TFontQuality",
    kind: "class",
    type: "TFontQuality",
    isShared: false,
    isPrivate: false,
    range: SYSTEM_RANGE,
    fileUri: SYSTEM_URI,
    description: "Enumeração para definir o quality da fonte.",
  },

  buildEnumVal("fqDefault", "TFontQuality", "Use o quality padrão da fonte."),
  buildEnumVal("fqDraft", "TFontQuality", "Use um quality de rascunho."),
  buildEnumVal("fqProof", "TFontQuality", "Use um quality de prova."),
  buildEnumVal("fqNonAntiAliased", "TFontQuality", "Use um quality sem anti-aliasing."),
  buildEnumVal("fqAntiAliased", "TFontQuality", "Use um quality com anti-aliasing."),
  buildEnumVal("fqClearType", "TFontQuality", "Use o quality ClearType."),
  buildEnumVal("fqClearTypeNatural", "TFontQuality", "Use o quality ClearType Natural."),
];
