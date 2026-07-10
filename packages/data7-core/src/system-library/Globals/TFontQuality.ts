import type { SystemSymbolInfo } from "../types";
import { defineEnum } from "../symbol-helpers";

export const symbols: SystemSymbolInfo[] = defineEnum({
  name: "TFontQuality",
  description: "Enumeração para definir o quality da fonte.",
  values: [
    ["fqDefault", "Use o quality padrão da fonte."],
    ["fqDraft", "Use um quality de rascunho."],
    ["fqProof", "Use um quality de prova."],
    ["fqNonAntiAliased", "Use um quality sem anti-aliasing."],
    ["fqAntiAliased", "Use um quality com anti-aliasing."],
    ["fqClearType", "Use o quality ClearType."],
    ["fqClearTypeNatural", "Use o quality ClearType Natural."],
  ],
});
